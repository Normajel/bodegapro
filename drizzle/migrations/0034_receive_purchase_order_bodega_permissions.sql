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

  IF new_role_name = 'ADMIN'
     AND old_role_name IS DISTINCT FROM 'ADMIN'
     AND NOT (old_role_name IS NOT DISTINCT FROM 'ADMINPRO' AND NOT is_owner) THEN
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

CREATE OR REPLACE FUNCTION public.transfer_platform_owner(p_new_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_role_name text;
  new_role_name text;
  adminpro_role_id uuid;
  admin_role_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Solo el propietario actual puede separar la cuenta ADMINPRO';
  END IF;
  IF auth.jwt() ->> 'aal' <> 'aal2' THEN
    RAISE EXCEPTION 'Se requiere verificar el segundo factor para separar la cuenta ADMINPRO';
  END IF;
  IF p_new_user_id IS NULL OR p_new_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Selecciona una cuenta ADMINPRO nueva';
  END IF;

  SELECT role.name INTO current_role_name
  FROM public.profiles profile
  JOIN public.app_roles role ON role.id = profile.role_id
  WHERE profile.id = auth.uid();
  IF current_role_name IS DISTINCT FROM 'ADMINPRO' THEN
    RAISE EXCEPTION 'La cuenta actual no tiene el perfil ADMINPRO';
  END IF;

  SELECT role.name INTO new_role_name
  FROM public.profiles profile
  JOIN public.app_roles role ON role.id = profile.role_id
  WHERE profile.id = p_new_user_id;
  IF new_role_name IS NULL OR new_role_name IN ('ADMIN', 'ADMINPRO') THEN
    RAISE EXCEPTION 'La cuenta nueva no está disponible para convertirse en ADMINPRO';
  END IF;

  SELECT id INTO adminpro_role_id FROM public.app_roles WHERE name = 'ADMINPRO';
  SELECT id INTO admin_role_id FROM public.app_roles WHERE name = 'ADMIN';
  IF adminpro_role_id IS NULL OR admin_role_id IS NULL THEN
    RAISE EXCEPTION 'No están configurados los perfiles ADMIN y ADMINPRO';
  END IF;

  UPDATE public.platform_owners
  SET user_id = p_new_user_id
  WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró el propietario actual';
  END IF;

  UPDATE public.profiles
  SET role_id = adminpro_role_id
  WHERE id = p_new_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo asignar el perfil ADMINPRO a la cuenta nueva';
  END IF;

  UPDATE public.profiles
  SET role_id = admin_role_id
  WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo conservar el perfil ADMIN de la cuenta actual';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_platform_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_platform_owner(uuid) TO authenticated;
