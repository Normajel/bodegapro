-- Platform credentials are never accessible to browser roles, even to ADMINPRO.
CREATE TABLE private.platform_email_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 domain text NOT NULL DEFAULT '',
 from_email text NOT NULL DEFAULT '',
 domain_id uuid,
 secret_id uuid REFERENCES vault.secrets(id),
 enabled boolean NOT NULL DEFAULT false,
 domain_status text NOT NULL DEFAULT 'not_configured',
 dns_records jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(dns_records)='array'),
 checked_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 revision integer NOT NULL DEFAULT 0,
 CHECK(NOT enabled OR (secret_id IS NOT NULL AND domain_id IS NOT NULL AND domain_status='verified' AND domain<>'' AND from_email<>''))
);
ALTER TABLE private.platform_email_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.platform_email_settings FROM PUBLIC,anon,authenticated;
INSERT INTO private.platform_email_settings(id) VALUES(true);
CREATE TABLE private.platform_email_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 action text NOT NULL CHECK(action IN ('save','verify','enable','disable')),
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 revision integer NOT NULL,
 domain text NOT NULL,
 from_email text NOT NULL,
 enabled boolean NOT NULL
);
ALTER TABLE private.platform_email_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.platform_email_audit FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.get_platform_email_config() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT (to_jsonb(c)-'secret_id') || jsonb_build_object('api_key',v.decrypted_secret,
 'audit',(SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM
 (SELECT action,actor_id,created_at,revision,domain,from_email,enabled FROM private.platform_email_audit ORDER BY id DESC LIMIT 10) a))
 FROM private.platform_email_settings c LEFT JOIN vault.decrypted_secrets v ON v.id=c.secret_id WHERE c.id;
$$;
REVOKE ALL ON FUNCTION private.get_platform_email_config() FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION private.get_platform_email_config() TO service_role;
CREATE FUNCTION public.get_platform_email_config() RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.get_platform_email_config()$$;
REVOKE ALL ON FUNCTION public.get_platform_email_config() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_email_config() TO service_role;

CREATE FUNCTION private.set_platform_email_config(p_revision integer,p_actor uuid,p_action text,p_settings jsonb,p_api_key text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.platform_email_settings%ROWTYPE; sid uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.platform_owners WHERE user_id=p_actor) THEN RAISE EXCEPTION 'Propietario requerido'; END IF;
 SELECT * INTO STRICT c FROM private.platform_email_settings WHERE id FOR UPDATE;
 IF c.revision<>p_revision THEN RAISE EXCEPTION 'La configuración cambió. Actualiza antes de continuar'; END IF;
 IF p_action NOT IN ('save','verify','enable','disable') THEN RAISE EXCEPTION 'Acción inválida'; END IF;
 sid=c.secret_id;
 IF p_api_key IS NOT NULL THEN
  IF p_action<>'save' OR p_api_key !~ '^re_[A-Za-z0-9_-]{10,200}$' THEN RAISE EXCEPTION 'Clave inválida'; END IF;
  IF sid IS NULL THEN sid=vault.create_secret(p_api_key); ELSE PERFORM vault.update_secret(sid,p_api_key); END IF;
 END IF;
 UPDATE private.platform_email_settings SET
 domain=p_settings->>'domain',from_email=p_settings->>'from_email',domain_id=(p_settings->>'domain_id')::uuid,
 secret_id=sid,enabled=(p_settings->>'enabled')::boolean,domain_status=p_settings->>'domain_status',
 dns_records=p_settings->'dns_records',checked_at=(p_settings->>'checked_at')::timestamptz,
 updated_at=now(),updated_by=p_actor,revision=c.revision+1 WHERE id;
 INSERT INTO private.platform_email_audit(action,actor_id,revision,domain,from_email,enabled)
 SELECT p_action,p_actor,revision,domain,from_email,enabled FROM private.platform_email_settings WHERE id;
END $$;
REVOKE ALL ON FUNCTION private.set_platform_email_config(integer,uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.set_platform_email_config(integer,uuid,text,jsonb,text) TO service_role;
CREATE FUNCTION public.set_platform_email_config(p_revision integer,p_actor uuid,p_action text,p_settings jsonb,p_api_key text DEFAULT NULL) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.set_platform_email_config(p_revision,p_actor,p_action,p_settings,p_api_key)$$;
REVOKE ALL ON FUNCTION public.set_platform_email_config(integer,uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_platform_email_config(integer,uuid,text,jsonb,text) TO service_role;
