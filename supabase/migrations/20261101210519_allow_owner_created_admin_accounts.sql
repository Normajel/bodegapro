-- Additional ADMIN accounts are assigned only by the trusted server.
-- The server requires platform ownership, ADMINPRO and MFA before creation.
CREATE OR REPLACE FUNCTION public.protect_role_assignments()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
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

  -- Browser sessions cannot edit the platform owner's account. The server
  -- additionally checks the caller before any Auth credential update.
  IF TG_OP='UPDATE' AND old_role_name='ADMINPRO'
     AND current_user <> 'service_role' AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Solo el propietario puede modificar su cuenta ADMINPRO';
  END IF;

  IF new_role_name = 'ADMIN'
     AND old_role_name IS DISTINCT FROM 'ADMIN'
     AND current_user <> 'service_role'
     AND NOT (old_role_name IS NOT DISTINCT FROM 'ADMINPRO' AND NOT is_owner) THEN
    RAISE EXCEPTION 'Los administradores adicionales deben crearse desde el alta autorizada del propietario';
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

