CREATE TABLE IF NOT EXISTS public.app_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_roles_name_not_empty CHECK (btrim(name) <> ''),
  CONSTRAINT app_roles_permissions_object CHECK (jsonb_typeof(permissions) = 'object')
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.app_roles(id) ON DELETE RESTRICT;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_roles TO authenticated;
GRANT ALL ON public.app_roles TO service_role;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;

ALTER TABLE public.app_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles profile
    JOIN public.app_roles role ON role.id = profile.role_id
    WHERE profile.id = auth.uid()
      AND role.name = 'ADMIN'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_app_permission(
  module_name text,
  action_name text DEFAULT 'view'
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_app_admin() OR EXISTS (
    SELECT 1
    FROM public.profiles profile
    JOIN public.app_roles role ON role.id = profile.role_id
    WHERE profile.id = auth.uid()
      AND (role.permissions -> module_name ->> action_name) = 'true'
  );
$$;

REVOKE ALL ON FUNCTION public.is_app_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_app_permission(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_app_permission(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_product(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  product_stock numeric;
BEGIN
  IF NOT public.has_app_permission('inventory', 'delete') THEN
    RAISE EXCEPTION 'No tienes permiso para quitar productos del inventario';
  END IF;

  SELECT stock_quantity INTO product_stock
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;
  IF product_stock > 0 THEN
    RAISE EXCEPTION 'No se puede quitar un producto con stock disponible. Registra su salida primero.';
  END IF;

  UPDATE public.products
  SET active = false, updated_at = now()
  WHERE id = p_product_id;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_product(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_product(uuid) TO authenticated;

CREATE POLICY "Authenticated users can read roles"
  ON public.app_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage roles"
  ON public.app_roles FOR ALL TO authenticated
  USING (public.is_app_admin() AND name <> 'ADMIN')
  WITH CHECK (public.is_app_admin() AND name <> 'ADMIN');

DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users read own or admins read all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_app_admin());
CREATE POLICY "Admins manage profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

INSERT INTO public.app_roles (name, permissions, is_system)
VALUES
  ('ADMIN', '{"dashboard":{"view":true},"inventory":{"view":true,"create":true,"edit":true,"delete":true},"movements":{"view":true,"create":true,"edit":true,"delete":true},"purchases":{"view":true,"create":true,"edit":true,"delete":true},"contacts":{"view":true,"create":true,"edit":true,"delete":true},"reports":{"view":true},"settings":{"manage":true}}'::jsonb, true),
  ('BODEGA', '{"dashboard":{"view":true},"inventory":{"view":true,"create":true,"edit":true},"movements":{"view":true,"create":true,"edit":true},"purchases":{"view":true},"contacts":{"view":true},"reports":{"view":true}}'::jsonb, true),
  ('GERENCIA', '{"dashboard":{"view":true},"inventory":{"view":true},"movements":{"view":true},"purchases":{"view":true},"contacts":{"view":true},"reports":{"view":true}}'::jsonb, true),
  ('VENTA', '{"dashboard":{"view":true},"inventory":{"view":true},"movements":{"view":true,"create":true},"contacts":{"view":true},"reports":{"view":true}}'::jsonb, true),
  ('OTRO', '{}'::jsonb, true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.profiles (id, full_name, email, role_id, created_at)
SELECT
  auth_user.id,
  COALESCE(auth_user.raw_user_meta_data->>'full_name', split_part(auth_user.email, '@', 1)),
  auth_user.email,
  (SELECT id FROM public.app_roles WHERE name = 'BODEGA'),
  auth_user.created_at
FROM auth.users auth_user
ON CONFLICT (id) DO UPDATE
SET full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
    email = COALESCE(public.profiles.email, EXCLUDED.email),
    role_id = COALESCE(public.profiles.role_id, EXCLUDED.role_id);

UPDATE public.profiles profile
SET role_id = role.id
FROM public.app_roles role
WHERE role.name = 'ADMIN'
  AND profile.id = (
    SELECT first_profile.id
    FROM public.profiles first_profile
    ORDER BY first_profile.created_at, first_profile.id
    LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles current_admin
    JOIN public.app_roles existing_admin_role ON existing_admin_role.id = current_admin.role_id
    WHERE existing_admin_role.name = 'ADMIN'
  );

UPDATE public.profiles
SET role_id = (SELECT id FROM public.app_roles WHERE name = 'BODEGA')
WHERE role_id IS NULL;

CREATE OR REPLACE FUNCTION public.protect_role_assignments()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  new_role_name text;
  old_role_name text;
BEGIN
  SELECT name INTO new_role_name FROM public.app_roles WHERE id = NEW.role_id;
  IF TG_OP = 'UPDATE' THEN
    SELECT name INTO old_role_name FROM public.app_roles WHERE id = OLD.role_id;
  END IF;

  IF new_role_name = 'ADMIN' AND old_role_name IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'El perfil ADMIN no se puede asignar a otro usuario';
  END IF;
  IF old_role_name = 'ADMIN' AND new_role_name IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'No se puede quitar el perfil ADMIN al último administrador';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_role_assignments
  BEFORE INSERT OR UPDATE OF role_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_role_assignments();

CREATE OR REPLACE FUNCTION public.protect_system_roles()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_system THEN
    RAISE EXCEPTION 'Los perfiles predeterminados no se pueden eliminar';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_system AND NOT NEW.is_system THEN
    RAISE EXCEPTION 'Los perfiles predeterminados no se pueden convertir en personalizados';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_system_roles
  BEFORE UPDATE OR DELETE ON public.app_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_system_roles();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    (SELECT id FROM public.app_roles WHERE name = 'BODEGA')
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      role_id = COALESCE(public.profiles.role_id, EXCLUDED.role_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP POLICY IF EXISTS "Team full access products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can read products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can insert products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can update products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can delete products" ON public.products;
CREATE POLICY "Read products for permitted modules" ON public.products
  FOR SELECT TO authenticated
  USING (
    public.has_app_permission('inventory', 'view')
    OR public.has_app_permission('dashboard', 'view')
    OR public.has_app_permission('movements', 'view')
    OR public.has_app_permission('purchases', 'view')
    OR public.has_app_permission('reports', 'view')
  );
CREATE POLICY "Create products" ON public.products
  FOR INSERT TO authenticated WITH CHECK (public.has_app_permission('inventory', 'create'));
CREATE POLICY "Update products" ON public.products
  FOR UPDATE TO authenticated USING (public.has_app_permission('inventory', 'edit'))
  WITH CHECK (public.has_app_permission('inventory', 'edit'));
CREATE POLICY "Delete products" ON public.products
  FOR DELETE TO authenticated USING (public.has_app_permission('inventory', 'delete'));

DROP POLICY IF EXISTS "Team full access suppliers" ON public.suppliers;
CREATE POLICY "Read suppliers for permitted modules" ON public.suppliers
  FOR SELECT TO authenticated
  USING (
    public.has_app_permission('contacts', 'view')
    OR public.has_app_permission('movements', 'view')
    OR public.has_app_permission('purchases', 'view')
    OR public.has_app_permission('reports', 'view')
  );
CREATE POLICY "Create suppliers" ON public.suppliers
  FOR INSERT TO authenticated WITH CHECK (public.has_app_permission('contacts', 'create'));
CREATE POLICY "Update suppliers" ON public.suppliers
  FOR UPDATE TO authenticated USING (public.has_app_permission('contacts', 'edit'))
  WITH CHECK (public.has_app_permission('contacts', 'edit'));
CREATE POLICY "Delete suppliers" ON public.suppliers
  FOR DELETE TO authenticated USING (public.has_app_permission('contacts', 'delete'));

DROP POLICY IF EXISTS "Team full access customers" ON public.customers;
CREATE POLICY "Read customers for permitted modules" ON public.customers
  FOR SELECT TO authenticated
  USING (
    public.has_app_permission('contacts', 'view')
    OR public.has_app_permission('movements', 'view')
    OR public.has_app_permission('reports', 'view')
  );
CREATE POLICY "Create customers" ON public.customers
  FOR INSERT TO authenticated WITH CHECK (public.has_app_permission('contacts', 'create'));
CREATE POLICY "Update customers" ON public.customers
  FOR UPDATE TO authenticated USING (public.has_app_permission('contacts', 'edit'))
  WITH CHECK (public.has_app_permission('contacts', 'edit'));
CREATE POLICY "Delete customers" ON public.customers
  FOR DELETE TO authenticated USING (public.has_app_permission('contacts', 'delete'));

DROP POLICY IF EXISTS "Team full access movements" ON public.stock_movements;
CREATE POLICY "Read movements for permitted modules" ON public.stock_movements
  FOR SELECT TO authenticated
  USING (
    public.has_app_permission('movements', 'view')
    OR public.has_app_permission('dashboard', 'view')
    OR public.has_app_permission('reports', 'view')
    OR public.has_app_permission('purchases', 'view')
  );
CREATE POLICY "Create movements" ON public.stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_app_permission('movements', 'create')
    OR public.has_app_permission('purchases', 'edit')
  );
CREATE POLICY "Update movements" ON public.stock_movements
  FOR UPDATE TO authenticated
  USING (
    public.has_app_permission('movements', 'edit')
    OR public.has_app_permission('purchases', 'edit')
  )
  WITH CHECK (
    public.has_app_permission('movements', 'edit')
    OR public.has_app_permission('purchases', 'edit')
  );
CREATE POLICY "Delete movements" ON public.stock_movements
  FOR DELETE TO authenticated
  USING (
    public.has_app_permission('movements', 'delete')
    OR public.has_app_permission('purchases', 'delete')
  );

DROP POLICY IF EXISTS "Team full access purchase orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Team full access purchase order items" ON public.purchase_order_items;
CREATE POLICY "Read purchase orders" ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (
    public.has_app_permission('purchases', 'view')
    OR public.has_app_permission('reports', 'view')
  );
CREATE POLICY "Create purchase orders" ON public.purchase_orders
  FOR INSERT TO authenticated WITH CHECK (public.has_app_permission('purchases', 'create'));
CREATE POLICY "Update purchase orders" ON public.purchase_orders
  FOR UPDATE TO authenticated USING (public.has_app_permission('purchases', 'edit'))
  WITH CHECK (public.has_app_permission('purchases', 'edit'));
CREATE POLICY "Delete purchase orders" ON public.purchase_orders
  FOR DELETE TO authenticated USING (public.has_app_permission('purchases', 'delete'));
CREATE POLICY "Read purchase order items" ON public.purchase_order_items
  FOR SELECT TO authenticated
  USING (
    public.has_app_permission('purchases', 'view')
    OR public.has_app_permission('reports', 'view')
  );
CREATE POLICY "Create purchase order items" ON public.purchase_order_items
  FOR INSERT TO authenticated WITH CHECK (public.has_app_permission('purchases', 'create'));
CREATE POLICY "Update purchase order items" ON public.purchase_order_items
  FOR UPDATE TO authenticated USING (public.has_app_permission('purchases', 'edit'))
  WITH CHECK (public.has_app_permission('purchases', 'edit'));
CREATE POLICY "Delete purchase order items" ON public.purchase_order_items
  FOR DELETE TO authenticated USING (public.has_app_permission('purchases', 'delete'));

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['purchase_entries', 'purchase_entry_items'] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Manage legacy purchases', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_app_permission(''purchases'', ''view''))', 'Read legacy purchases', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_app_permission(''purchases'', ''create''))', 'Create legacy purchases', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.has_app_permission(''purchases'', ''edit'')) WITH CHECK (public.has_app_permission(''purchases'', ''edit''))', 'Update legacy purchases', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.has_app_permission(''purchases'', ''delete''))', 'Delete legacy purchases', table_name);
  END LOOP;
END;
$$;
