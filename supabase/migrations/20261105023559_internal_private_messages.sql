BEGIN;
CREATE TABLE public.internal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  read_at timestamptz,
  CHECK (sender_id <> recipient_id)
);
CREATE INDEX internal_messages_sender_thread ON public.internal_messages (sender_id, recipient_id, created_at DESC, id DESC);
CREATE INDEX internal_messages_recipient_thread ON public.internal_messages (recipient_id, sender_id, created_at DESC, id DESC);
CREATE INDEX internal_messages_unread ON public.internal_messages (recipient_id) WHERE read_at IS NULL;
ALTER TABLE public.internal_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.internal_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT (sender_id, recipient_id, body), UPDATE (read_at)
  ON public.internal_messages TO authenticated;

CREATE FUNCTION private.internal_chat_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles p JOIN public.app_roles r ON r.id = p.role_id
    WHERE p.id = auth.uid()
      AND (r.name NOT IN ('ADMIN', 'ADMINPRO') OR auth.jwt()->>'aal' = 'aal2')
  );
$$;
REVOKE ALL ON FUNCTION private.internal_chat_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.internal_chat_member() TO authenticated;

CREATE POLICY internal_messages_read ON public.internal_messages FOR SELECT TO authenticated
  USING ((SELECT private.internal_chat_member())
    AND ((SELECT auth.uid()) = sender_id OR (SELECT auth.uid()) = recipient_id));
CREATE POLICY internal_messages_mark_read ON public.internal_messages FOR UPDATE TO authenticated
  USING ((SELECT private.internal_chat_member()) AND recipient_id = (SELECT auth.uid()) AND read_at IS NULL)
  WITH CHECK ((SELECT private.internal_chat_member()) AND recipient_id = (SELECT auth.uid()) AND read_at IS NOT NULL);

CREATE FUNCTION private.internal_chat_contacts()
RETURNS TABLE (user_id uuid, display_name text, role_name text, unread_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id, coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.username), ''), r.name), r.name,
    (SELECT count(*) FROM public.internal_messages m
     WHERE m.sender_id = p.id AND m.recipient_id = auth.uid() AND m.read_at IS NULL)
  FROM public.profiles p JOIN public.app_roles r ON r.id = p.role_id
  WHERE private.internal_chat_member() AND p.id <> auth.uid()
    AND (r.name <> 'ADMINPRO' OR EXISTS (
      SELECT 1 FROM public.internal_messages m WHERE m.sender_id = p.id AND m.recipient_id = auth.uid()
    ))
  ORDER BY 2, 1;
$$;
REVOKE ALL ON FUNCTION private.internal_chat_contacts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.internal_chat_contacts() TO authenticated;
CREATE FUNCTION public.internal_chat_contacts()
RETURNS TABLE (user_id uuid, display_name text, role_name text, unread_count bigint)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT * FROM private.internal_chat_contacts();
$$;
REVOKE ALL ON FUNCTION public.internal_chat_contacts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.internal_chat_contacts() TO authenticated;
CREATE POLICY internal_messages_send ON public.internal_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = (SELECT auth.uid()) AND recipient_id IN (
    SELECT user_id FROM private.internal_chat_contacts()
  ));
COMMIT;
