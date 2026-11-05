BEGIN;

CREATE TABLE public.internal_chat_clears (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  peer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cleared_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, peer_id),
  CHECK (user_id <> peer_id)
);
ALTER TABLE public.internal_chat_clears ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.internal_chat_clears FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE (cleared_at) ON public.internal_chat_clears TO authenticated;
CREATE POLICY internal_chat_clears_own ON public.internal_chat_clears TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT private.internal_chat_member()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT private.internal_chat_member()));

CREATE POLICY internal_messages_after_clear ON public.internal_messages AS RESTRICTIVE
  FOR SELECT TO authenticated USING (NOT EXISTS (
    SELECT 1 FROM public.internal_chat_clears c
    WHERE c.user_id = (SELECT auth.uid())
      AND c.peer_id = CASE WHEN sender_id = (SELECT auth.uid()) THEN recipient_id ELSE sender_id END
      AND c.cleared_at >= created_at
  ));

CREATE FUNCTION public.internal_chat_inbox()
RETURNS TABLE (user_id uuid, display_name text, role_name text, unread_count bigint, last_message_at timestamptz)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT c.user_id, c.display_name, c.role_name, thread.unread_count, thread.last_message_at
  FROM public.internal_chat_contacts() c
  CROSS JOIN LATERAL (
    SELECT count(*) FILTER (WHERE m.recipient_id = auth.uid() AND m.read_at IS NULL) AS unread_count,
           max(m.created_at) AS last_message_at
    FROM public.internal_messages m
    WHERE (m.sender_id = auth.uid() AND m.recipient_id = c.user_id)
       OR (m.sender_id = c.user_id AND m.recipient_id = auth.uid())
  ) thread
  ORDER BY thread.last_message_at DESC NULLS LAST, c.display_name, c.user_id;
$$;
REVOKE ALL ON FUNCTION public.internal_chat_inbox() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.internal_chat_inbox() TO authenticated;

CREATE FUNCTION public.clear_internal_chat(p_peer_id uuid)
RETURNS void LANGUAGE sql SET search_path = '' AS $$
  INSERT INTO public.internal_chat_clears AS c (user_id, peer_id, cleared_at)
  SELECT auth.uid(), p_peer_id, clock_timestamp()
  WHERE EXISTS (
    SELECT 1 FROM public.internal_messages m
    WHERE (m.sender_id = auth.uid() AND m.recipient_id = p_peer_id)
       OR (m.sender_id = p_peer_id AND m.recipient_id = auth.uid())
  )
  ON CONFLICT (user_id, peer_id) DO UPDATE
  SET cleared_at = greatest(c.cleared_at, EXCLUDED.cleared_at);
$$;
REVOKE ALL ON FUNCTION public.clear_internal_chat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_internal_chat(uuid) TO authenticated;

COMMIT;
