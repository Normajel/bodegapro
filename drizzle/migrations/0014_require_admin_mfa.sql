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
    WHEN role.name = 'ADMIN' THEN auth.jwt() ->> 'aal' = 'aal2'
    ELSE (role.permissions -> module_name ->> action_name) = 'true'
  END
  FROM public.profiles profile
  JOIN public.app_roles role ON role.id = profile.role_id
  WHERE profile.id = auth.uid();
$$;

DROP POLICY IF EXISTS "Admins manage roles" ON public.app_roles;
CREATE POLICY "Admins manage roles"
  ON public.app_roles FOR ALL TO authenticated
  USING (public.is_app_admin() AND auth.jwt() ->> 'aal' = 'aal2' AND name <> 'ADMIN')
  WITH CHECK (public.is_app_admin() AND auth.jwt() ->> 'aal' = 'aal2' AND name <> 'ADMIN');

DROP POLICY IF EXISTS "Users read own or admins read all profiles" ON public.profiles;
CREATE POLICY "Users read own or admins read all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR (public.is_app_admin() AND auth.jwt() ->> 'aal' = 'aal2'));

DROP POLICY IF EXISTS "Admins manage profiles" ON public.profiles;
CREATE POLICY "Admins manage profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_app_admin() AND auth.jwt() ->> 'aal' = 'aal2')
  WITH CHECK (public.is_app_admin() AND auth.jwt() ->> 'aal' = 'aal2');

REVOKE ALL ON FUNCTION public.has_app_permission(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_app_permission(text, text) TO authenticated;
