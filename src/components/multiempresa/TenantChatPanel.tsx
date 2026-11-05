import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/lib/multiempresa/database.types";
import { loadMyCompanies } from "@/lib/multiempresa/company-api";

const db = supabase as unknown as SupabaseClient<Database>;

export function TenantChatLauncher({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  const session = useQuery({
    queryKey: ["tenant", companyId, "chat-session"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user?.id ?? null;
    },
    enabled: !!companyId,
    staleTime: 0,
  });
  const access = useQuery({
    queryKey: ["tenant", companyId, "chat-access"],
    queryFn: async () => {
      const memberships = await loadMyCompanies();
      const role = memberships.find(({ company }) => company.id === companyId)?.role;
      if (!role) return false;
      const { data, error } = await db
        .from("tenant_chat_role_settings")
        .select("enabled")
        .eq("company_id", companyId)
        .eq("role_code", role)
        .maybeSingle();
      if (error) throw error;
      return data?.enabled === true;
    },
    enabled: !!companyId && !!session.data,
    staleTime: 0,
  });

  if (!session.data || access.data !== true) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((old) => !old)}
        className="rounded border border-teal-600 px-3 py-2 text-sm font-semibold text-teal-800"
      >
        {open ? "Cerrar mensajes" : "Mensajes internos"}
      </button>
      {open && (
        <TenantChatPanel
          key={companyId + session.data}
          companyId={companyId}
          userId={session.data}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function TenantChatPanel({
  companyId,
  userId,
  onClose,
}: {
  companyId: string;
  userId: string;
  onClose: () => void;
}) {
  const cache = useQueryClient();
  const [peerId, setPeerId] = useState("");
  const [body, setBody] = useState("");
  const key = ["tenant", companyId, "chat"] as const;
  const contacts = useQuery({
    queryKey: [...key, "contacts"],
    queryFn: async () => {
      const { data, error } = await db.rpc("tenant_chat_contacts", { p_company_id: companyId });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15000,
  });
  const messages = useQuery({
    queryKey: [...key, "thread", peerId],
    enabled: !!peerId,
    queryFn: async () => {
      const { data, error } = await db
        .from("tenant_chat_messages")
        .select("id,company_id,sender_id,recipient_id,body,created_at,read_at")
        .eq("company_id", companyId)
        .or(
          `and(sender_id.eq.${userId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${userId})`,
        )
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data ?? []).reverse();
    },
    refetchInterval: 15000,
  });
  const send = useMutation({
    mutationFn: async () => {
      if (!contacts.data?.some((contact) => contact.user_id === peerId))
        throw new Error("Elige un destinatario válido.");
      if (!body.trim() || body.trim().length > 2000)
        throw new Error("El mensaje debe tener entre 1 y 2000 caracteres.");
      const { error } = await db.from("tenant_chat_messages").insert({
        company_id: companyId,
        sender_id: userId,
        recipient_id: peerId,
        body: body.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setBody("");
      await cache.invalidateQueries({ queryKey: key });
    },
  });
  const markRead = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await db
        .from("tenant_chat_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("company_id", companyId)
        .eq("sender_id", contactId)
        .eq("recipient_id", userId)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: key });
    },
  });
  const clear = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await db.from("tenant_chat_clears").upsert(
        {
          company_id: companyId,
          user_id: userId,
          peer_id: contactId,
          cleared_at: new Date().toISOString(),
        },
        { onConflict: "company_id,user_id,peer_id" },
      );
      if (error) throw error;
    },
    onSuccess: async (_, contactId) => {
      if (peerId === contactId) setPeerId("");
      await cache.invalidateQueries({ queryKey: key });
    },
  });
  const label = (id: string, role: string) => `${role} · ${id.slice(0, 8)}`;

  return (
    <section
      className="basis-full rounded-xl border border-slate-200 bg-white p-4"
      aria-label="Chat privado de la empresa"
    >
      <div className="flex justify-between gap-3">
        <div>
          <h2 className="font-semibold">Mensajes internos</h2>
          <p className="text-xs text-slate-600">
            Solo usuarios de esta empresa. El historial se conserva hasta que lo ocultes.
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded border px-3 py-1 text-sm">
          Cerrar
        </button>
      </div>
      {contacts.isError && <p role="alert">No se pudieron cargar los usuarios del chat.</p>}
      {contacts.isPending && <p role="status">Cargando destinatarios…</p>}
      {contacts.isSuccess && (
        <>
          <label className="mt-3 block text-sm font-medium">
            Elegir usuario
            <select
              value={peerId}
              onChange={(event) => setPeerId(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 bg-white p-2"
            >
              <option value="">Selecciona un usuario</option>
              {contacts.data.map((contact) => (
                <option key={contact.user_id} value={contact.user_id}>
                  {label(contact.user_id, contact.role_code)}
                  {contact.unread_count > 0 ? ` · ${contact.unread_count} sin leer` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-3 space-y-2">
            {contacts.data
              .filter((item) => item.last_message_at)
              .map((contact) => (
                <div
                  key={contact.user_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm"
                >
                  <span>
                    {label(contact.user_id, contact.role_code)} · {contact.unread_count} sin leer
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded border px-3 py-1"
                      onClick={() => {
                        setPeerId(contact.user_id);
                        markRead.mutate(contact.user_id);
                      }}
                    >
                      Leer
                    </button>
                    <button
                      type="button"
                      title="Quitar de mi historial"
                      aria-label={`Quitar historial de ${label(contact.user_id, contact.role_code)}`}
                      className="rounded border px-3 py-1 text-red-700"
                      onClick={() => {
                        if (window.confirm("¿Quitar esta conversación solo de tu historial?"))
                          clear.mutate(contact.user_id);
                      }}
                    >
                      X
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </>
      )}
      {peerId && (
        <>
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded border p-3">
            {messages.isPending && <p role="status">Cargando conversación…</p>}
            {messages.isError && <p role="alert">No se pudo cargar la conversación.</p>}
            {messages.data?.map((message) => (
              <p key={message.id} className="rounded bg-slate-50 p-2 text-sm">
                <strong>
                  {message.sender_id === userId
                    ? "Tú"
                    : label(
                        message.sender_id,
                        contacts.data?.find((c) => c.user_id === message.sender_id)?.role_code ??
                          "Usuario",
                      )}
                  :{" "}
                </strong>
                {message.body}
                <span className="ml-2 text-xs text-slate-500">
                  {new Date(message.created_at).toLocaleString("es-CL")}
                </span>
              </p>
            ))}
            {messages.isSuccess && messages.data.length === 0 && (
              <p className="text-sm text-slate-600">No hay mensajes en esta conversación.</p>
            )}
          </div>
          <form
            className="mt-3 flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              send.mutate();
            }}
          >
            <textarea
              value={body}
              maxLength={2000}
              rows={2}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Escribe un mensaje…"
              className="rounded border border-slate-300 p-2 text-sm"
            />
            <button
              type="submit"
              disabled={!body.trim() || send.isPending}
              className="self-start rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Enviar
            </button>
          </form>
        </>
      )}
      {(send.isError || clear.isError || markRead.isError) && (
        <p role="alert" className="mt-2 text-red-700">
          No se pudo completar la operación del chat.
        </p>
      )}
    </section>
  );
}
