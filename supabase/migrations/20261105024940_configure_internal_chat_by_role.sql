BEGIN;

-- Preserve existing access. Roles created after this migration require explicit activation.
UPDATE public.app_roles
SET permissions = permissions || '{"internal_chat":{"view":true}}'::jsonb,
    updated_at = now()
WHERE NOT (permissions ? 'internal_chat');

CREATE OR REPLACE FUNCTION private.internal_chat_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles p JOIN public.app_roles r ON r.id = p.role_id
    WHERE p.id = auth.uid()
      AND public.has_app_permission('internal_chat', 'view')
      AND (r.name NOT IN ('ADMIN', 'ADMINPRO') OR auth.jwt()->>'aal' = 'aal2')
  );
$$;

CREATE OR REPLACE FUNCTION private.internal_chat_contacts()
RETURNS TABLE (user_id uuid, display_name text, role_name text, unread_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id, coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.username), ''), r.name), r.name,
    (SELECT count(*) FROM public.internal_messages m
     WHERE m.sender_id = p.id AND m.recipient_id = auth.uid() AND m.read_at IS NULL)
  FROM public.profiles p JOIN public.app_roles r ON r.id = p.role_id
  WHERE private.internal_chat_member() AND p.id <> auth.uid()
    AND (CASE WHEN r.name = 'ADMINPRO' THEN EXISTS (
      SELECT 1 FROM public.platform_owners o WHERE o.user_id = p.id
    ) ELSE r.permissions->'internal_chat'->'view' = 'true'::jsonb END)
    AND (r.name <> 'ADMINPRO' OR EXISTS (
      SELECT 1 FROM public.internal_messages m WHERE m.sender_id = p.id AND m.recipient_id = auth.uid()
    ))
  ORDER BY 2, 1;
$$;

COMMIT;
