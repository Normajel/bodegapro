-- Materialize ADMIN's formerly implicit access before making it configurable.
UPDATE public.app_roles r SET permissions=r.permissions || (
 SELECT jsonb_object_agg(d.key,d.value || CASE WHEN jsonb_typeof(r.permissions->d.key)='object' THEN r.permissions->d.key ELSE '{}'::jsonb END)
 FROM jsonb_each('{"dashboard":{"view":true},"inventory":{"view":true,"create":true,"edit":true,"delete":true},"movements":{"view":true,"create":true,"edit":true,"delete":true},"purchases":{"view":true,"create":true,"edit":true,"delete":true,"approve":true,"receive":true,"send":true},"contacts":{"view":true,"create":true,"edit":true,"delete":true},"reports":{"view":true},"cubication":{"view":true,"edit":true},"cubication_document":{"view":true},"management":{"view":true},"settings":{"manage":true}}'::jsonb) d
),updated_at=now() WHERE r.name='ADMIN';
UPDATE public.app_roles SET permissions=permissions || jsonb_build_object('management',jsonb_build_object('view',true))
 WHERE name IN ('GERENCIA','GERENTE') AND NOT permissions ? 'management';

CREATE OR REPLACE FUNCTION public.has_app_permission(module_name text,action_name text DEFAULT 'view') RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT CASE
 WHEN r.name='ADMINPRO' THEN public.is_platform_owner() AND (auth.jwt()->>'aal')='aal2'
 WHEN r.name='ADMIN' THEN (auth.jwt()->>'aal')='aal2' AND r.permissions->module_name->action_name='true'::jsonb
 ELSE r.permissions->module_name->action_name='true'::jsonb END
 FROM public.profiles p JOIN public.app_roles r ON r.id=p.role_id WHERE p.id=auth.uid()),false);
$$;

CREATE FUNCTION private.can_manage_admin_role() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND coalesce(auth.jwt()->>'aal'='aal2',false)
 AND public.is_platform_owner() AND EXISTS(SELECT 1 FROM public.profiles p JOIN public.app_roles r ON r.id=p.role_id WHERE p.id=auth.uid() AND r.name='ADMINPRO');
$$;
REVOKE ALL ON FUNCTION private.can_manage_admin_role() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.can_manage_admin_role() TO authenticated;

-- Restricted admins cannot regain access by taking over or creating a more privileged account.
CREATE FUNCTION private.can_manage_role_members(p_role_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT
 CASE WHEN private.can_manage_admin_role() THEN true
 WHEN public.is_app_admin() AND public.has_app_permission('settings','manage') AND target.name<>'ADMINPRO'
 THEN NOT EXISTS(
 SELECT 1 FROM jsonb_each(target.permissions) m
 CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(m.value)='object' THEN m.value ELSE '{}'::jsonb END) a
 WHERE a.value='true'::jsonb AND NOT public.has_app_permission(m.key,a.key))
 ELSE false END FROM public.app_roles target WHERE target.id=p_role_id),false);
$$;
REVOKE ALL ON FUNCTION private.can_manage_role_members(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.can_manage_role_members(uuid) TO authenticated;
CREATE FUNCTION public.can_manage_role_members(p_role_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.can_manage_role_members(p_role_id) $$;
REVOKE ALL ON FUNCTION public.can_manage_role_members(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_role_members(uuid) TO authenticated;

ALTER POLICY "Admins manage roles" ON public.app_roles
 USING(public.is_app_admin() AND public.has_app_permission('settings','manage') AND name NOT IN ('ADMIN','ADMINPRO'))
 WITH CHECK(public.is_app_admin() AND public.has_app_permission('settings','manage') AND name NOT IN ('ADMIN','ADMINPRO'));
CREATE POLICY "Owner edits ADMIN permissions" ON public.app_roles FOR UPDATE TO authenticated
 USING(name='ADMIN' AND private.can_manage_admin_role())
 WITH CHECK(name='ADMIN' AND private.can_manage_admin_role());
ALTER POLICY "Admins manage profiles" ON public.profiles
 USING(public.is_app_admin() AND public.has_app_permission('settings','manage') AND private.can_manage_role_members(role_id))
 WITH CHECK(public.is_app_admin() AND public.has_app_permission('settings','manage') AND private.can_manage_role_members(role_id));
ALTER POLICY "Users read own or admins read all profiles" ON public.profiles
 USING(id=auth.uid() OR (public.is_app_admin() AND public.has_app_permission('settings','manage')));

CREATE OR REPLACE FUNCTION public.protect_system_roles() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE m record; a record; old_permissions jsonb='{}'; caller_role text;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.is_system THEN RAISE EXCEPTION 'Los perfiles predeterminados no se pueden eliminar'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  old_permissions=OLD.permissions;
  IF OLD.is_system AND (NOT NEW.is_system OR NEW.name IS DISTINCT FROM OLD.name OR NEW.id IS DISTINCT FROM OLD.id) THEN
   RAISE EXCEPTION 'La identidad de los perfiles predeterminados está protegida';
  END IF;
  IF OLD.name IN ('ADMIN','ADMINPRO') AND NEW.permissions IS DISTINCT FROM OLD.permissions AND current_user NOT IN ('postgres','service_role') THEN
   IF OLD.name='ADMINPRO' OR NOT private.can_manage_admin_role() THEN RAISE EXCEPTION 'Solo el propietario ADMINPRO con segundo factor puede modificar los permisos de ADMIN'; END IF;
  END IF;
 END IF;
 IF current_user NOT IN ('postgres','service_role') THEN
  SELECT r.name INTO caller_role FROM public.profiles p JOIN public.app_roles r ON r.id=p.role_id WHERE p.id=auth.uid();
  IF caller_role='ADMIN' THEN
   FOR m IN SELECT * FROM jsonb_each(NEW.permissions) LOOP
    FOR a IN SELECT * FROM jsonb_each(CASE WHEN jsonb_typeof(m.value)='object' THEN m.value ELSE '{}'::jsonb END) LOOP
     IF a.value='true'::jsonb AND (old_permissions->m.key->a.key) IS DISTINCT FROM 'true'::jsonb AND NOT public.has_app_permission(m.key,a.key) THEN
      RAISE EXCEPTION 'ADMIN no puede conceder permisos que no posee. Solicita el cambio a ADMINPRO';
     END IF;
    END LOOP;
   END LOOP;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER protect_system_roles BEFORE INSERT OR UPDATE OR DELETE ON public.app_roles
 FOR EACH ROW EXECUTE FUNCTION public.protect_system_roles();
