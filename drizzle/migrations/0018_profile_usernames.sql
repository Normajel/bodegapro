ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;

-- Usuarios existentes: el nombre de usuario parte con la primera parte del correo.
WITH base AS (
  SELECT
    id,
    coalesce(
      nullif(left(regexp_replace(lower(split_part(coalesce(email, ''), '@', 1)), '[^a-z0-9_.-]', '', 'g'), 32), ''),
      'usuario'
    ) AS candidate,
    created_at
  FROM public.profiles
  WHERE username IS NULL
),
ranked AS (
  SELECT
    id,
    candidate,
    row_number() OVER (PARTITION BY candidate ORDER BY created_at, id) AS position
  FROM base
)
UPDATE public.profiles profile
SET username = CASE
  WHEN ranked.position = 1
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles other
      WHERE other.username = ranked.candidate AND other.id <> ranked.id
    )
  THEN ranked.candidate
  ELSE ranked.candidate || '_' || ranked.position
END
FROM ranked
WHERE profile.id = ranked.id;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_username_format;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format
  CHECK (username IS NULL OR username ~ '^[a-z0-9][a-z0-9_.-]{2,31}$');

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON public.profiles (username);

-- Solo el servidor (service role) o un ADMIN pueden cambiar nombres de usuario.
CREATE OR REPLACE FUNCTION public.protect_profile_username()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NEW.username IS DISTINCT FROM OLD.username
     AND NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'No puedes cambiar el nombre de usuario';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_username ON public.profiles;
CREATE TRIGGER protect_profile_username
  BEFORE UPDATE OF username ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_username();

NOTIFY pgrst, 'reload schema';
