import { X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

export function useUnreadInternalMessages(userId: string | undefined) {
  return useQuery({
    queryKey: ["internal-chat", userId, "unread"],
    enabled: !!userId,
    refetchInterval: 10000,
    queryFn: async () => {
      if (!userId) return 0;
      const { count, error } = await supabase.from("internal_messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId).is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

const timeFormat = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short", timeStyle: "short", timeZone: "America/Santiago",
});

export function InternalChat({ userId, onClose }: { userId: string; onClose: () => void }) {
  const cache = useQueryClient();
  const key = ["internal-chat", userId];
  const [peer, setPeer] = useState("");
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState("");
  const contacts = useQuery({
    queryKey: [...key, "contacts"],
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("internal_chat_inbox");
      if (error) throw error;
      return data ?? [];
    },
  });
  const thread = useQuery({
    queryKey: [...key, "thread", peer, page],
    enabled: !!peer,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase.from("internal_messages")
        .select("id, sender_id, body, created_at, read_at")
        .or(`and(sender_id.eq.${userId},recipient_id.eq.${peer}),and(sender_id.eq.${peer},recipient_id.eq.${userId})`)
        .order("created_at", { ascending: false }).order("id", { ascending: false })
        .range(page * 30, page * 30 + 30);
      if (error) throw error;
      return data ?? [];
    },
  });
  useEffect(() => {
    if (!thread.data) return;
    const ids = thread.data.slice(0, 30)
      .filter((message) => message.sender_id === peer && !message.read_at)
      .map((message) => message.id);
    if (!ids.length) return;
    void supabase.from("internal_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", userId).is("read_at", null).in("id", ids)
      .then(({ error }) => {
        if (!error) void cache.invalidateQueries({ queryKey: ["internal-chat", userId] });
      });
  }, [cache, peer, thread.data, userId]);

  const send = useMutation({
    mutationFn: async ({ recipient, body }: { recipient: string; body: string }) => {
      const { error } = await supabase.from("internal_messages")
        .insert({ sender_id: userId, recipient_id: recipient, body });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft("");
      return cache.invalidateQueries({ queryKey: key });
    },
  });
  const clear = useMutation({
    mutationFn: async (recipient: string) => {
      const { error } = await supabase.rpc("clear_internal_chat", { p_peer_id: recipient });
      if (error) throw error;
    },
    onSuccess: async (_, recipient) => {
      if (peer === recipient) openConversation("");
      cache.removeQueries({ queryKey: [...key, "thread", recipient] });
      await cache.invalidateQueries({ queryKey: key });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (peer && draft.trim() && !send.isPending && !clear.isPending) send.mutate({ recipient: peer, body: draft.trim() });
  }
  function openConversation(user: string) {
    setPage(0);
    if (user === peer) return;
    setPeer(user);
    setDraft("");
    send.reset();
  }

  const conversations = contacts.data?.filter((contact) => contact.last_message_at) ?? [];
  const selectedContact = contacts.data?.find((contact) => contact.user_id === peer);
  const messages = thread.data?.slice(0, 30).reverse() ?? [];
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Mensajes internos</DialogTitle>
        <DialogDescription>Conversación privada entre dos usuarios de BodegaPro.</DialogDescription>
        <label className="grid gap-1 text-sm">
          Usuario
          <select
            className="input w-full"
            value={peer}
            disabled={send.isPending || clear.isPending}
            onChange={(event) => openConversation(event.target.value)}
          >
            <option value="">Selecciona un usuario</option>
            {contacts.data?.map((contact) => (
              <option key={contact.user_id} value={contact.user_id}>
                {contact.display_name} · {contact.role_name}
                {contact.unread_count > 0 ? ` (${contact.unread_count} sin leer)` : ""}
              </option>
            ))}
          </select>
        </label>
        {conversations.length > 0 && (
          <section className="space-y-2" aria-labelledby="conversations-title">
            <h3 id="conversations-title" className="text-sm font-semibold">
              Conversaciones
            </h3>
            <ul className="space-y-2">
              {conversations.map((sender) => (
                <li key={sender.user_id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0 break-words text-sm">
                    <p className="font-semibold">{sender.display_name}</p>
                    <p className="text-muted-foreground">
                      {sender.role_name}{sender.unread_count > 0 ? ` · ${sender.unread_count} sin leer` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className="btn btn-secondary min-h-11"
                      aria-label={`Leer mensajes de ${sender.display_name}`}
                      disabled={send.isPending || clear.isPending}
                      onClick={() => openConversation(sender.user_id)}
                    >
                      Leer
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost min-h-11 min-w-11 text-destructive"
                      aria-label={`Eliminar conversación con ${sender.display_name}`}
                      title="Eliminar de mi historial"
                      disabled={send.isPending || clear.isPending}
                      onClick={() => {
                        if (window.confirm(`¿Quitar la conversación con ${sender.display_name} de tu historial?`)) {
                          clear.mutate(sender.user_id);
                        }
                      }}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {clear.isError && <p role="alert">No se pudo eliminar la conversación. Intenta nuevamente.</p>}
        {contacts.isError && <p role="alert">No se pudieron cargar los usuarios.</p>}
        {contacts.isSuccess && !contacts.data.length && <p>No hay otros usuarios disponibles.</p>}
        {peer && (
          <>
            {selectedContact && (
              <h3 className="break-words text-sm font-semibold">
                Conversación con {selectedContact.display_name}
              </h3>
            )}
            <div className="max-h-[35dvh] space-y-2 overflow-y-auto rounded-lg border p-3" aria-label="Historial de la conversación">
              {(thread.data?.length ?? 0) > 30 && (
                <button type="button" className="btn btn-secondary" onClick={() => setPage(page + 1)}>
                  Ver mensajes anteriores
                </button>
              )}
              {page > 0 && (
                <button type="button" className="btn btn-secondary" onClick={() => setPage(page - 1)}>
                  Mensajes más recientes
                </button>
              )}
              {thread.isPending && <p>Cargando conversación…</p>}
              {thread.isError && <p role="alert">No se pudo cargar la conversación.</p>}
              {thread.isSuccess && !messages.length && <p>Aún no hay mensajes.</p>}
              {messages.map((message) => (
                <article key={message.id} className={message.sender_id === userId
                  ? "ml-auto max-w-[85%] rounded-lg bg-accent p-2"
                  : "mr-auto max-w-[85%] rounded-lg bg-muted p-2"}>
                  <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                  <time className="text-xs text-muted-foreground" dateTime={message.created_at}>
                    {message.sender_id === userId ? "Tú · " : ""}{timeFormat.format(new Date(message.created_at))}
                  </time>
                </article>
              ))}
            </div>
            <form className="space-y-2" onSubmit={submit}>
              <textarea aria-label="Mensaje" placeholder="Escribe un mensaje…" className="input w-full"
                rows={2} required maxLength={2000} value={draft} disabled={send.isPending || clear.isPending}
                onChange={(event) => setDraft(event.target.value)} />
              {send.isError && <p role="alert">No se pudo enviar el mensaje. Puedes reintentar.</p>}
              <button className="btn btn-primary" disabled={!draft.trim() || send.isPending || clear.isPending}>Enviar</button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
