CREATE TABLE public.platform_owners (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_owners (user_id)
SELECT profile.id
FROM public.profiles profile
JOIN public.app_roles role ON role.id = profile.role_id
WHERE role.name = 'ADMIN'
ORDER BY profile.created_at, profile.id
LIMIT 1
ON CONFLICT (user_id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_owners) THEN
    RAISE EXCEPTION 'No se encontró un usuario ADMIN para inicializar ADMINPRO';
  END IF;
END;
$$;

ALTER TABLE public.platform_owners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_owners FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.platform_owners TO authenticated;

CREATE POLICY "Platform owners read own registration"
  ON public.platform_owners FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_owners owner
    WHERE owner.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_owner() TO authenticated;

INSERT INTO public.app_roles (name, permissions, is_system)
SELECT 'ADMINPRO', permissions, true
FROM public.app_roles
WHERE name = 'ADMIN'
ON CONFLICT (name) DO UPDATE
SET permissions = EXCLUDED.permissions,
    is_system = true,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.protect_role_assignments()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  new_role_name text;
  old_role_name text;
  is_owner boolean;
BEGIN
  SELECT name INTO new_role_name FROM public.app_roles WHERE id = NEW.role_id;
  IF TG_OP = 'UPDATE' THEN
    SELECT name INTO old_role_name FROM public.app_roles WHERE id = OLD.role_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.platform_owners WHERE user_id = NEW.id
  ) INTO is_owner;

  IF new_role_name = 'ADMIN' AND old_role_name IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'El perfil ADMIN no se puede asignar a otro usuario';
  END IF;
  IF new_role_name = 'ADMINPRO' AND NOT is_owner THEN
    RAISE EXCEPTION 'El perfil ADMINPRO está reservado al propietario de la plataforma';
  END IF;
  IF old_role_name = 'ADMIN'
     AND new_role_name IS DISTINCT FROM 'ADMIN'
     AND NOT (new_role_name = 'ADMINPRO' AND is_owner) THEN
    RAISE EXCEPTION 'No se puede quitar el perfil ADMIN al último administrador';
  END IF;
  IF old_role_name = 'ADMINPRO' AND new_role_name IS DISTINCT FROM 'ADMINPRO' AND is_owner THEN
    RAISE EXCEPTION 'No se puede quitar el perfil ADMINPRO al propietario de la plataforma';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_role_assignments() FROM PUBLIC, anon, authenticated;

UPDATE public.profiles profile
SET role_id = role.id
FROM public.app_roles role
WHERE role.name = 'ADMINPRO'
  AND profile.id IN (SELECT owner.user_id FROM public.platform_owners owner);

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
      AND (
        role.name = 'ADMIN'
        OR (role.name = 'ADMINPRO' AND public.is_platform_owner())
      )
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
  SELECT CASE
    WHEN role.name IN ('ADMIN', 'ADMINPRO') THEN
      public.is_app_admin() AND auth.jwt() ->> 'aal' = 'aal2'
    ELSE (role.permissions -> module_name ->> action_name) = 'true'
  END
  FROM public.profiles profile
  JOIN public.app_roles role ON role.id = profile.role_id
  WHERE profile.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.is_app_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;
REVOKE ALL ON FUNCTION public.has_app_permission(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_app_permission(text, text) TO authenticated;

DROP POLICY IF EXISTS "Admins manage roles" ON public.app_roles;
CREATE POLICY "Admins manage roles"
  ON public.app_roles FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    AND auth.jwt() ->> 'aal' = 'aal2'
    AND name NOT IN ('ADMIN', 'ADMINPRO')
  )
  WITH CHECK (
    public.is_app_admin()
    AND auth.jwt() ->> 'aal' = 'aal2'
    AND name NOT IN ('ADMIN', 'ADMINPRO')
  );

UPDATE public.app_roles
SET permissions =
  permissions ||
  jsonb_build_object(
    'cubication',
    coalesce(permissions -> 'cubication', '{}'::jsonb) ||
      CASE
        WHEN permissions -> 'reports' ->> 'view' = 'true' THEN '{"view":true}'::jsonb
        ELSE '{}'::jsonb
      END ||
      CASE
        WHEN permissions -> 'movements' ->> 'edit' = 'true' THEN '{"edit":true}'::jsonb
        ELSE '{}'::jsonb
      END
  ) ||
  jsonb_build_object(
    'cubication_document',
    coalesce(permissions -> 'cubication_document', '{}'::jsonb) ||
      CASE
        WHEN permissions -> 'reports' ->> 'view' = 'true' THEN '{"view":true}'::jsonb
        ELSE '{}'::jsonb
      END
  ),
  updated_at = now()
WHERE name NOT IN ('ADMIN', 'ADMINPRO');

CREATE TABLE public.platform_menu_settings (
  module_key text PRIMARY KEY CHECK (
    module_key IN (
      'dashboard',
      'inventory',
      'purchases',
      'movements',
      'contacts',
      'reports',
      'cubication',
      'cubication_document',
      'settings'
    )
  ),
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.platform_menu_settings (module_key, label)
VALUES
  ('dashboard', 'Panel'),
  ('inventory', 'Inventario'),
  ('purchases', 'Órdenes de compra'),
  ('movements', 'Movimientos'),
  ('contacts', 'Contactos'),
  ('reports', 'Informes'),
  ('cubication', 'Cubicación'),
  ('cubication_document', 'Documento de cubicación'),
  ('settings', 'Configuración')
ON CONFLICT (module_key) DO NOTHING;

ALTER TABLE public.platform_menu_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_menu_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.platform_menu_settings TO authenticated;

CREATE POLICY "Authenticated users read platform menu settings"
  ON public.platform_menu_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Platform owner manages platform menu settings"
  ON public.platform_menu_settings FOR UPDATE TO authenticated
  USING (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());
