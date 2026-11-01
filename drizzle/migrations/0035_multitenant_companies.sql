CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.companies (name)
SELECT coalesce(nullif(btrim(name), ''), 'Empresa principal')
FROM public.company_settings
WHERE id = true;

INSERT INTO public.companies (name)
SELECT 'Empresa principal'
WHERE NOT EXISTS (SELECT 1 FROM public.companies);

ALTER TABLE public.company_settings ADD COLUMN company_id uuid;
ALTER TABLE public.products ADD COLUMN company_id uuid;
ALTER TABLE public.suppliers ADD COLUMN company_id uuid;
ALTER TABLE public.customers ADD COLUMN company_id uuid;
ALTER TABLE public.stock_movements ADD COLUMN company_id uuid;
ALTER TABLE public.purchase_orders ADD COLUMN company_id uuid;
ALTER TABLE public.purchase_order_items ADD COLUMN company_id uuid;
ALTER TABLE public.purchase_cost_centers ADD COLUMN company_id uuid;
ALTER TABLE public.cubication_templates ADD COLUMN company_id uuid;
ALTER TABLE public.cubication_template_items ADD COLUMN company_id uuid;
ALTER TABLE public.stock_movement_document_cancellations ADD COLUMN company_id uuid;
ALTER TABLE public.app_roles ADD COLUMN company_id uuid;

UPDATE public.company_settings
SET company_id = (SELECT id FROM public.companies ORDER BY created_at, id LIMIT 1);
UPDATE public.products
SET company_id = (SELECT id FROM public.companies ORDER BY created_at, id LIMIT 1);
UPDATE public.suppliers
SET company_id = (SELECT id FROM public.companies ORDER BY created_at, id LIMIT 1);
UPDATE public.customers
SET company_id = (SELECT id FROM public.companies ORDER BY created_at, id LIMIT 1);
UPDATE public.stock_movements
SET company_id = (SELECT id FROM public.companies ORDER BY created_at, id LIMIT 1);
UPDATE public.purchase_orders
SET company_id = (SELECT id FROM public.companies ORDER BY created_at, id LIMIT 1);
UPDATE public.purchase_order_items item
SET company_id = purchase_order.company_id
FROM public.purchase_orders purchase_order
WHERE item.purchase_order_id = purchase_order.id;
UPDATE public.purchase_cost_centers
SET company_id = (SELECT id FROM public.companies ORDER BY created_at, id LIMIT 1);
UPDATE public.cubication_templates
SET company_id = (SELECT id FROM public.companies ORDER BY created_at, id LIMIT 1);
UPDATE public.cubication_template_items item
SET company_id = template.company_id
FROM public.cubication_templates template
WHERE item.template_id = template.id;
UPDATE public.stock_movement_document_cancellations cancellation
SET company_id = movement.company_id
FROM public.stock_movements movement
WHERE cancellation.stock_movement_id = movement.id;
UPDATE public.app_roles
SET company_id = (SELECT id FROM public.companies ORDER BY created_at, id LIMIT 1)
WHERE NOT is_system;
UPDATE public.app_roles SET company_id = NULL WHERE is_system;

ALTER TABLE public.company_settings ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.products ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.suppliers ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.customers ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.stock_movements ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.purchase_orders ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.purchase_order_items ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.purchase_cost_centers ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.cubication_templates ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.cubication_template_items ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.stock_movement_document_cancellations ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE public.company_settings DROP CONSTRAINT company_settings_pkey;
ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_pkey PRIMARY KEY (company_id, id);
ALTER TABLE public.company_settings
  ADD CONSTRAINT company_settings_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;
CREATE UNIQUE INDEX products_company_sku_idx ON public.products(company_id, sku);
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_order_number_key;
CREATE UNIQUE INDEX purchase_orders_company_order_number_idx
  ON public.purchase_orders(company_id, order_number);
DROP INDEX IF EXISTS public.purchase_cost_centers_name_idx;
CREATE UNIQUE INDEX purchase_cost_centers_company_name_idx
  ON public.purchase_cost_centers(company_id, lower(btrim(name)));
ALTER TABLE public.cubication_templates
  DROP CONSTRAINT IF EXISTS cubication_templates_unit_type_unit_code_key;
CREATE UNIQUE INDEX cubication_templates_company_unit_key
  ON public.cubication_templates(company_id, unit_type, unit_code);

ALTER TABLE public.products
  ADD CONSTRAINT products_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.customers
  ADD CONSTRAINT customers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_order_items
  ADD CONSTRAINT purchase_order_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_cost_centers
  ADD CONSTRAINT purchase_cost_centers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.cubication_templates
  ADD CONSTRAINT cubication_templates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.cubication_template_items
  ADD CONSTRAINT cubication_template_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.stock_movement_document_cancellations
  ADD CONSTRAINT stock_movement_document_cancellations_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.app_roles
  ADD CONSTRAINT app_roles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.app_roles DROP CONSTRAINT IF EXISTS app_roles_name_key;
CREATE UNIQUE INDEX app_roles_system_name_idx ON public.app_roles(name) WHERE is_system;
CREATE UNIQUE INDEX app_roles_company_name_idx
  ON public.app_roles(company_id, lower(btrim(name))) WHERE NOT is_system;
ALTER TABLE public.app_roles
  ADD CONSTRAINT app_roles_company_system_check
  CHECK ((is_system AND company_id IS NULL) OR (NOT is_system AND company_id IS NOT NULL));

CREATE TABLE public.company_memberships (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.app_roles(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id)
);

ALTER TABLE public.profiles ADD COLUMN active_company_id uuid;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_active_company_id_fkey
  FOREIGN KEY (active_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

INSERT INTO public.company_memberships (company_id, user_id, role_id)
SELECT
  company.id,
  profile.id,
  CASE
    WHEN role.name = 'ADMINPRO' THEN (SELECT id FROM public.app_roles WHERE name = 'ADMIN' AND is_system)
    ELSE coalesce(profile.role_id, (SELECT id FROM public.app_roles WHERE name = 'BODEGA' AND is_system))
  END
FROM public.profiles profile
CROSS JOIN LATERAL (
  SELECT id FROM public.companies ORDER BY created_at, id LIMIT 1
) company
LEFT JOIN public.app_roles role ON role.id = profile.role_id
WHERE coalesce(profile.role_id, (SELECT id FROM public.app_roles WHERE name = 'BODEGA' AND is_system)) IS NOT NULL;

UPDATE public.profiles profile
SET active_company_id = membership.company_id
FROM public.company_memberships membership
WHERE membership.user_id = profile.id;

CREATE OR REPLACE FUNCTION public.initialize_active_company_for_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM set_config('app.validated_active_company_user', NEW.user_id::text, true);
  UPDATE public.profiles
  SET active_company_id = NEW.company_id
  WHERE id = NEW.user_id AND active_company_id IS NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.initialize_active_company_for_membership() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER initialize_active_company_on_membership
  AFTER INSERT ON public.company_memberships
  FOR EACH ROW EXECUTE FUNCTION public.initialize_active_company_for_membership();

CREATE INDEX company_memberships_user_idx ON public.company_memberships(user_id);
CREATE INDEX company_memberships_role_idx ON public.company_memberships(role_id);

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT profile.active_company_id
  FROM public.profiles profile
  JOIN public.company_memberships membership
    ON membership.user_id = profile.id
   AND membership.company_id = profile.active_company_id
   AND membership.is_active
  WHERE profile.id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.active_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.current_company_id()
$$;

CREATE OR REPLACE FUNCTION public.set_active_company(p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.company_memberships membership
    WHERE membership.user_id = auth.uid()
      AND membership.company_id = p_company_id
      AND membership.is_active
  ) THEN
    RAISE EXCEPTION 'No perteneces a esa empresa';
  END IF;
  PERFORM set_config('app.validated_active_company_user', auth.uid()::text, true);
  UPDATE public.profiles
  SET active_company_id = p_company_id
  WHERE id = auth.uid();
  RETURN p_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_active_company_selection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.active_company_id IS DISTINCT FROM OLD.active_company_id
     AND current_setting('app.validated_active_company_user', true) IS DISTINCT FROM NEW.id::text THEN
    RAISE EXCEPTION 'Cambia la empresa activa mediante set_active_company';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_active_company_guard
  BEFORE UPDATE OF active_company_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_active_company_selection();

CREATE OR REPLACE FUNCTION public.active_role_name()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role.name
  FROM public.company_memberships membership
  JOIN public.app_roles role ON role.id = membership.role_id
  WHERE membership.user_id = auth.uid()
    AND membership.company_id = public.active_company_id()
$$;

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(public.active_role_name() = 'ADMIN', false)
      OR (coalesce(public.active_role_name() = 'ADMINPRO', false) AND public.is_platform_owner())
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
  SELECT CASE
    WHEN role.name = 'ADMIN' THEN true
    WHEN role.name = 'ADMINPRO' THEN public.is_platform_owner() AND auth.jwt() ->> 'aal' = 'aal2'
    ELSE coalesce((role.permissions -> module_name ->> action_name) = 'true', false)
  END
  FROM public.company_memberships membership
  JOIN public.app_roles role ON role.id = membership.role_id
  WHERE membership.user_id = auth.uid()
    AND membership.company_id = public.active_company_id()
    AND (role.is_system OR role.company_id = membership.company_id)
$$;

REVOKE ALL ON FUNCTION public.active_company_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_active_company(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.active_role_name() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_app_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_app_permission(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.active_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_active_company(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.active_role_name() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_app_permission(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_company_with_admin(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  company_ref uuid;
  admin_role_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_owner() OR auth.jwt() ->> 'aal' <> 'aal2' THEN
    RAISE EXCEPTION 'Solo el propietario de la plataforma con MFA puede crear empresas';
  END IF;
  IF nullif(btrim(p_name), '') IS NULL OR char_length(btrim(p_name)) > 200 THEN
    RAISE EXCEPTION 'Ingresa un nombre de empresa válido';
  END IF;
  SELECT id INTO admin_role_id FROM public.app_roles WHERE name = 'ADMIN' AND is_system;
  IF admin_role_id IS NULL THEN RAISE EXCEPTION 'No está configurado el perfil ADMIN'; END IF;
  INSERT INTO public.companies(name, created_by)
  VALUES (btrim(p_name), auth.uid())
  RETURNING id INTO company_ref;
  INSERT INTO public.company_memberships(company_id, user_id, role_id)
  VALUES (company_ref, auth.uid(), admin_role_id);
  PERFORM public.set_active_company(company_ref);
  INSERT INTO public.company_settings(company_id, id, name, updated_by)
  VALUES (company_ref, true, btrim(p_name), auth.uid());
  RETURN company_ref;
END;
$$;

REVOKE ALL ON FUNCTION public.create_company_with_admin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_company_with_admin(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_company_relationships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  active_company uuid := public.active_company_id();
  related_company uuid;
  related_order_id uuid;
BEGIN
  IF active_company IS NOT NULL AND NEW.company_id IS DISTINCT FROM active_company THEN
    RAISE EXCEPTION 'La fila no pertenece a la empresa activa';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'No se puede transferir una fila entre empresas';
  END IF;

  IF TG_TABLE_NAME = 'products' AND NEW.supplier_id IS NOT NULL THEN
    SELECT company_id INTO related_company FROM public.suppliers WHERE id = NEW.supplier_id;
    IF related_company IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'Proveedor de otra empresa'; END IF;
  ELSIF TG_TABLE_NAME = 'purchase_orders' THEN
    SELECT company_id INTO related_company FROM public.suppliers WHERE id = NEW.supplier_id;
    IF related_company IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'Proveedor de otra empresa'; END IF;
    IF NEW.cost_center_id IS NOT NULL THEN
      SELECT company_id INTO related_company FROM public.purchase_cost_centers WHERE id = NEW.cost_center_id;
      IF related_company IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'Centro de costo de otra empresa'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'purchase_order_items' THEN
    SELECT company_id INTO related_company FROM public.purchase_orders WHERE id = NEW.purchase_order_id;
    IF related_company IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'Orden de otra empresa'; END IF;
    IF NEW.product_id IS NOT NULL THEN
      SELECT company_id INTO related_company FROM public.products WHERE id = NEW.product_id;
      IF related_company IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'Producto de otra empresa'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'stock_movements' THEN
    SELECT company_id INTO related_company FROM public.products WHERE id = NEW.product_id;
    IF related_company IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'Producto de otra empresa'; END IF;
    IF NEW.supplier_id IS NOT NULL THEN
      SELECT company_id INTO related_company FROM public.suppliers WHERE id = NEW.supplier_id;
      IF related_company IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'Proveedor de otra empresa'; END IF;
    END IF;
    IF NEW.customer_id IS NOT NULL THEN
      SELECT company_id INTO related_company FROM public.customers WHERE id = NEW.customer_id;
      IF related_company IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'Cliente de otra empresa'; END IF;
    END IF;
    IF NEW.purchase_order_id IS NOT NULL THEN
      SELECT company_id INTO related_company FROM public.purchase_orders WHERE id = NEW.purchase_order_id;
      IF related_company IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'Orden de otra empresa'; END IF;
    END IF;
    IF NEW.purchase_order_item_id IS NOT NULL THEN
      SELECT company_id, purchase_order_id
      INTO related_company, related_order_id
      FROM public.purchase_order_items
      WHERE id = NEW.purchase_order_item_id;
      IF related_company IS DISTINCT FROM NEW.company_id
         OR (NEW.purchase_order_id IS NOT NULL AND related_order_id IS DISTINCT FROM NEW.purchase_order_id) THEN
        RAISE EXCEPTION 'Ítem de orden de otra empresa';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'cubication_template_items' THEN
    SELECT company_id INTO related_company FROM public.cubication_templates WHERE id = NEW.template_id;
    IF related_company IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'Plantilla de otra empresa'; END IF;
    SELECT company_id INTO related_company FROM public.products WHERE id = NEW.product_id;
    IF related_company IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'Producto de otra empresa'; END IF;
  ELSIF TG_TABLE_NAME = 'stock_movement_document_cancellations' THEN
    SELECT company_id INTO related_company FROM public.stock_movements WHERE id = NEW.stock_movement_id;
    IF related_company IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'Movimiento de otra empresa'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER products_company_guard BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_company_relationships();
CREATE TRIGGER purchase_orders_company_guard BEFORE INSERT OR UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_company_relationships();
CREATE TRIGGER purchase_order_items_company_guard BEFORE INSERT OR UPDATE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_company_relationships();
CREATE TRIGGER stock_movements_company_guard BEFORE INSERT OR UPDATE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_company_relationships();
CREATE TRIGGER cubication_template_items_company_guard BEFORE INSERT OR UPDATE ON public.cubication_template_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_company_relationships();
CREATE TRIGGER movement_cancellations_company_guard
  BEFORE INSERT OR UPDATE ON public.stock_movement_document_cancellations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_company_relationships();

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_memberships ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.companies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_memberships TO authenticated;

CREATE POLICY companies_member_read ON public.companies
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.company_memberships membership
    WHERE membership.company_id = companies.id
      AND membership.user_id = auth.uid()
      AND membership.is_active
  ));
CREATE POLICY memberships_select_scope ON public.company_memberships AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR company_id = public.active_company_id());
CREATE POLICY memberships_insert_scope ON public.company_memberships AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.active_company_id());
CREATE POLICY memberships_update_scope ON public.company_memberships AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (company_id = public.active_company_id())
  WITH CHECK (company_id = public.active_company_id());
CREATE POLICY memberships_delete_scope ON public.company_memberships AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (company_id = public.active_company_id());
CREATE POLICY memberships_read ON public.company_memberships
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_app_admin());
CREATE POLICY memberships_admin_insert ON public.company_memberships
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_app_admin()
    AND auth.jwt() ->> 'aal' = 'aal2'
    AND EXISTS (
      SELECT 1 FROM public.app_roles role
      WHERE role.id = role_id
        AND (role.is_system OR role.company_id = company_memberships.company_id)
        AND role.name NOT IN ('ADMIN', 'ADMINPRO')
    )
  );
CREATE POLICY memberships_admin_update ON public.company_memberships
  FOR UPDATE TO authenticated
  USING (public.is_app_admin() AND auth.jwt() ->> 'aal' = 'aal2')
  WITH CHECK (
    public.is_app_admin()
    AND auth.jwt() ->> 'aal' = 'aal2'
    AND EXISTS (
      SELECT 1 FROM public.app_roles role
      WHERE role.id = role_id
        AND (role.is_system OR role.company_id = company_memberships.company_id)
        AND role.name NOT IN ('ADMIN', 'ADMINPRO')
    )
  );
CREATE POLICY memberships_admin_delete ON public.company_memberships
  FOR DELETE TO authenticated
  USING (
    public.is_app_admin()
    AND auth.jwt() ->> 'aal' = 'aal2'
    AND role_id NOT IN (SELECT id FROM public.app_roles WHERE name IN ('ADMIN', 'ADMINPRO'))
  );

DROP POLICY IF EXISTS "Authenticated users can read roles" ON public.app_roles;
DROP POLICY IF EXISTS "Admins manage roles" ON public.app_roles;
CREATE POLICY app_roles_tenant_scope ON public.app_roles AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (is_system OR company_id = public.active_company_id())
  WITH CHECK (NOT is_system AND company_id = public.active_company_id());
CREATE POLICY app_roles_read ON public.app_roles
  FOR SELECT TO authenticated
  USING (is_system OR company_id = public.active_company_id());
CREATE POLICY app_roles_admin_insert ON public.app_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    NOT is_system AND company_id = public.active_company_id()
    AND public.is_app_admin() AND auth.jwt() ->> 'aal' = 'aal2'
  );
CREATE POLICY app_roles_admin_update ON public.app_roles
  FOR UPDATE TO authenticated
  USING (
    NOT is_system AND company_id = public.active_company_id()
    AND public.is_app_admin() AND auth.jwt() ->> 'aal' = 'aal2'
  )
  WITH CHECK (
    NOT is_system AND company_id = public.active_company_id()
    AND public.is_app_admin() AND auth.jwt() ->> 'aal' = 'aal2'
  );
CREATE POLICY app_roles_admin_delete ON public.app_roles
  FOR DELETE TO authenticated
  USING (
    NOT is_system AND company_id = public.active_company_id()
    AND public.is_app_admin() AND auth.jwt() ->> 'aal' = 'aal2'
  );

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'company_settings', 'products', 'suppliers', 'customers', 'stock_movements',
    'purchase_orders', 'purchase_order_items', 'purchase_cost_centers',
    'cubication_templates', 'cubication_template_items',
    'stock_movement_document_cancellations'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (company_id = public.active_company_id()) WITH CHECK (company_id = public.active_company_id())',
      table_name || '_tenant_scope', table_name
    );
  END LOOP;
END;
$$;

ALTER TABLE public.company_settings ALTER COLUMN company_id SET DEFAULT public.active_company_id();
ALTER TABLE public.products ALTER COLUMN company_id SET DEFAULT public.active_company_id();
ALTER TABLE public.suppliers ALTER COLUMN company_id SET DEFAULT public.active_company_id();
ALTER TABLE public.customers ALTER COLUMN company_id SET DEFAULT public.active_company_id();
ALTER TABLE public.stock_movements ALTER COLUMN company_id SET DEFAULT public.active_company_id();
ALTER TABLE public.purchase_orders ALTER COLUMN company_id SET DEFAULT public.active_company_id();
ALTER TABLE public.purchase_order_items ALTER COLUMN company_id SET DEFAULT public.active_company_id();
ALTER TABLE public.purchase_cost_centers ALTER COLUMN company_id SET DEFAULT public.active_company_id();
ALTER TABLE public.cubication_templates ALTER COLUMN company_id SET DEFAULT public.active_company_id();
ALTER TABLE public.cubication_template_items ALTER COLUMN company_id SET DEFAULT public.active_company_id();
ALTER TABLE public.stock_movement_document_cancellations
  ALTER COLUMN company_id SET DEFAULT public.active_company_id();
ALTER TABLE public.app_roles ALTER COLUMN company_id SET DEFAULT public.active_company_id();

DROP POLICY IF EXISTS "Read company settings" ON public.company_settings;
DROP POLICY IF EXISTS "Insert company settings" ON public.company_settings;
DROP POLICY IF EXISTS "Update company settings" ON public.company_settings;
CREATE POLICY company_settings_read ON public.company_settings
  FOR SELECT TO authenticated
  USING (
    public.has_app_permission('purchases', 'view')
    OR public.has_app_permission('settings', 'manage')
  );
CREATE POLICY company_settings_insert ON public.company_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_app_permission('settings', 'manage'));
CREATE POLICY company_settings_update ON public.company_settings
  FOR UPDATE TO authenticated
  USING (public.has_app_permission('settings', 'manage'))
  WITH CHECK (public.has_app_permission('settings', 'manage'));

CREATE OR REPLACE FUNCTION public.get_supplier_order_info(p_supplier_id uuid)
RETURNS TABLE (
  id uuid, name text, rut text, city text, address text, delivery_address text,
  contact_name text, phone text, email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT supplier.id, supplier.name, supplier.rut, supplier.city, supplier.address,
         supplier.delivery_address, supplier.contact_name, supplier.phone, supplier.email
  FROM public.suppliers supplier
  WHERE supplier.id = p_supplier_id
    AND supplier.company_id = public.active_company_id()
    AND (
      public.has_app_permission('purchases', 'view')
      OR public.has_app_permission('contacts', 'view')
    )
$$;

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
  WHERE id = p_product_id AND company_id = public.active_company_id()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;
  IF product_stock > 0 THEN
    RAISE EXCEPTION 'No se puede quitar un producto con stock disponible. Registra su salida primero.';
  END IF;
  UPDATE public.products
  SET active = false, updated_at = now()
  WHERE id = p_product_id AND company_id = public.active_company_id();
END;
$$;

ALTER FUNCTION public.anular_salida_documento(uuid[], text) SECURITY INVOKER;
ALTER FUNCTION public.anular_entrada_documento(uuid[], text) SECURITY INVOKER;
ALTER FUNCTION public.editar_salida_documento(uuid[], jsonb) SECURITY INVOKER;
ALTER FUNCTION public.editar_entrada_documento(uuid[], jsonb) SECURITY INVOKER;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_order_id uuid,
  p_document_type text,
  p_document_number text,
  p_lines jsonb
) RETURNS SETOF public.stock_movements
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  role_name text;
  order_row public.purchase_orders%ROWTYPE;
  item jsonb;
  line_row public.purchase_order_items%ROWTYPE;
  receive_quantity numeric;
  batch uuid := gen_random_uuid();
  tenant_id uuid := public.active_company_id();
BEGIN
  IF auth.uid() IS NULL OR tenant_id IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión en una empresa'; END IF;
  SELECT public.active_role_name() INTO role_name;
  IF role_name IS NULL
     OR role_name NOT IN ('BODEGA', 'ADMIN', 'ADMINPRO')
     OR NOT public.has_app_permission('purchases', 'view')
     OR NOT public.has_app_permission('movements', 'create')
     OR (role_name <> 'BODEGA' AND NOT public.has_app_permission('purchases', 'edit')) THEN
    RAISE EXCEPTION 'No tienes permiso para registrar recepciones de órdenes de compra';
  END IF;
  IF p_document_type NOT IN ('factura', 'guia_despacho') THEN RAISE EXCEPTION 'Selecciona factura o guía de despacho'; END IF;
  IF nullif(btrim(p_document_number), '') IS NULL THEN RAISE EXCEPTION 'Ingresa el número de factura o guía'; END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Ingresa las cantidades recibidas';
  END IF;
  SELECT * INTO order_row
  FROM public.purchase_orders
  WHERE id = p_order_id AND company_id = tenant_id
  FOR UPDATE;
  IF order_row.id IS NULL OR order_row.status IN ('completa', 'anulada') THEN
    RAISE EXCEPTION 'La orden no está disponible para recepción';
  END IF;
  IF order_row.approval_status <> 'aprobada' THEN
    RAISE EXCEPTION 'La orden debe estar aprobada antes de registrar su recepción';
  END IF;
  PERFORM product.id
  FROM public.products product
  WHERE product.company_id = tenant_id
    AND product.id IN (
      SELECT purchase_item.product_id
      FROM public.purchase_order_items purchase_item
      JOIN jsonb_array_elements(p_lines) AS requested(value)
        ON (requested.value->>'item_id')::uuid = purchase_item.id
      WHERE purchase_item.purchase_order_id = p_order_id
        AND purchase_item.company_id = tenant_id
        AND purchase_item.item_type = 'producto'
    )
  ORDER BY product.id
  FOR UPDATE;
  FOR item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO line_row
    FROM public.purchase_order_items
    WHERE id = (item->>'item_id')::uuid
      AND purchase_order_id = p_order_id
      AND company_id = tenant_id
    FOR UPDATE;
    IF line_row.id IS NULL OR line_row.item_type <> 'producto' OR line_row.product_id IS NULL THEN
      RAISE EXCEPTION 'Solo se pueden recepcionar productos de inventario';
    END IF;
    receive_quantity := coalesce((item->>'quantity')::numeric, 0);
    IF receive_quantity < 0 OR receive_quantity > line_row.quantity - line_row.received_quantity THEN
      RAISE EXCEPTION 'La cantidad recibida supera lo pendiente para el producto';
    END IF;
    IF receive_quantity > 0 THEN
      INSERT INTO public.stock_movements(
        company_id, product_id, type, quantity, quantity_value, measure_unit, unit_cost,
        supplier_id, purchase_order, purchase_order_id, purchase_order_item_id,
        document_type, document_number, batch_id, created_by
      ) VALUES (
        tenant_id, line_row.product_id, 'entrada',
        greatest(1, round(receive_quantity)::integer), receive_quantity,
        line_row.measure_unit, line_row.unit_cost, order_row.supplier_id,
        order_row.order_number, p_order_id, line_row.id,
        p_document_type, btrim(p_document_number), batch, auth.uid()
      );
      UPDATE public.purchase_order_items
      SET received_quantity = received_quantity + receive_quantity
      WHERE id = line_row.id AND company_id = tenant_id;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM public.purchase_order_items
    WHERE purchase_order_id = p_order_id AND company_id = tenant_id
      AND item_type = 'producto' AND received_quantity < quantity
  ) THEN
    UPDATE public.purchase_orders SET status = 'completa', updated_at = now()
    WHERE id = p_order_id AND company_id = tenant_id;
  ELSE
    UPDATE public.purchase_orders SET status = 'parcial', updated_at = now()
    WHERE id = p_order_id AND company_id = tenant_id;
  END IF;
  RETURN QUERY
  SELECT * FROM public.stock_movements
  WHERE batch_id = batch AND company_id = tenant_id
  ORDER BY created_at, id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_supplier_order_info(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_supplier_order_info(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.archive_product(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_product(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid, text, text, jsonb) TO authenticated;

GRANT INSERT ON public.stock_movement_document_cancellations TO authenticated;
CREATE POLICY movement_cancellation_insert ON public.stock_movement_document_cancellations
  FOR INSERT TO authenticated
  WITH CHECK (public.has_app_permission('movements', 'delete'));

NOTIFY pgrst, 'reload schema';
