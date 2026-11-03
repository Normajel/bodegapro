import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { hasPermission, type CurrentAccess } from "@/lib/permissions";
import {
  notificationSummarySchema,
  receivesRoleNotifications,
  roleNotices,
} from "@/lib/role-notifications";
type ReadState = { owner: string; keys: string[] };
export function RoleNotifications({ access }: { access: CurrentAccess }) {
  const enabled = receivesRoleNotifications(access.name);
  const queryClient = useQueryClient();
  const owner = `${access.userId ?? "session"}:${access.name}`;
  const storageKey = access.userId ? `integrastock-notice-read:${owner}` : null;
  const [readState, setReadState] = useState<ReadState>({ owner: "", keys: [] });
  const [showRead, setShowRead] = useState(false);
  const announced = useRef(new Set<string>());
  const currentOwner = useRef(owner);
  const canViewOrders = hasPermission(access.name, access.permissions, "purchases", "view");
  const toastId = (key: string) => `role-notice-${owner}-${key}`;
  useEffect(() => {
    const ids = announced.current;
    return () => {
      for (const key of ids) toast.dismiss(`role-notice-${owner}-${key}`);
    };
  }, [owner]);
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["role-notifications", access.userId ?? null, access.name],
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 30000,
    refetchOnWindowFocus: "always",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_role_notifications");
      if (error) throw error;
      return notificationSummarySchema.parse(data);
    },
  });
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel(`role-notifications-orders-${access.userId ?? "session"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_orders" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["role-notifications"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [access.userId, enabled, queryClient]);
  useEffect(() => {
    if (currentOwner.current !== owner) {
      announced.current.clear();
      currentOwner.current = owner;
    }
    let keys: string[] = [];
    if (storageKey) {
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
        if (Array.isArray(saved))
          keys = saved.filter((key): key is string => typeof key === "string");
        // Al ingresar nuevamente, los pendientes de aprobación deben volver a avisar.
        if (["GERENCIA", "GERENTE"].includes(access.name.trim().toUpperCase())) {
          keys = keys.filter((key) => key !== "approvals");
          localStorage.setItem(storageKey, JSON.stringify(keys));
        }
      } catch {
        /* In-memory read status still works when storage is unavailable. */
      }
    }
    setReadState({ owner, keys });
    setShowRead(false);
  }, [access.name, owner, storageKey]);
  const persist = useCallback(
    (keys: string[]) => {
      setReadState({ owner, keys });
      if (storageKey)
        try {
          localStorage.setItem(storageKey, JSON.stringify(keys));
        } catch {
          /* Keep in-memory state. */
        }
    },
    [owner, storageKey],
  );
  const ready = readState.owner === owner;
  const notices = data ? roleNotices(access.name, data) : [];
  const readKeys = ready ? readState.keys : [];
  const unread = notices.filter((notice) => !readKeys.includes(notice.key));
  const markRead = (keys: string[]) => {
    persist([...new Set([...readKeys, ...keys])]);
    for (const key of keys) toast.dismiss(toastId(key));
  };
  useEffect(() => {
    if (!enabled || !data || isError || !ready) return;
    const active = roleNotices(access.name, data);
    const activeKeys = new Set(active.map((notice) => notice.key));
    const stillRead = readState.keys.filter((key) => activeKeys.has(key));
    if (stillRead.length !== readState.keys.length) {
      persist(stillRead);
      return;
    }
    for (const key of announced.current) {
      if (!activeKeys.has(key)) {
        announced.current.delete(key);
        toast.dismiss(`role-notice-${owner}-${key}`);
      }
    }
    for (const notice of active) {
      if (readState.keys.includes(notice.key) || announced.current.has(notice.key)) continue;
      const id = `role-notice-${owner}-${notice.key}`;
      const acknowledge = () => {
        setReadState((previous) => {
          if (previous.owner !== owner) return previous;
          const keys = [...new Set([...previous.keys, notice.key])];
          if (storageKey)
            try {
              localStorage.setItem(storageKey, JSON.stringify(keys));
            } catch {
              /* Keep in-memory state. */
            }
          return { owner, keys };
        });
        toast.dismiss(id);
      };
      toast.warning(
        <button
          type="button"
          className="min-h-11 w-full text-left"
          onClick={acknowledge}
          aria-label={`Cerrar aviso: ${notice.message}`}
        >
          {notice.message}
        </button>,
        {
          id,
          duration: 10000,
          closeButton: true,
          dismissible: true,
          onDismiss: acknowledge,
        },
      );
      announced.current.add(notice.key);
    }
  }, [access.name, data, enabled, isError, owner, persist, readState, ready, storageKey]);
  if (!enabled) return null;
  const count = isError || !ready ? 0 : unread.length;
  const visible = showRead ? notices : unread;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={() => void refetch()}
          className="btn btn-ghost relative h-11 w-11 shrink-0 p-2"
          aria-label={
            isError ? "Notificaciones no disponibles" : `Notificaciones: ${count} sin leer`
          }
        >
          <Bell aria-hidden="true" />
          {count > 0 && (
            <span
              aria-hidden="true"
              className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-bold text-white"
            >
              {count}
            </span>
          )}
          {isError && (
            <span aria-hidden="true" className="absolute right-0 top-0 font-bold text-destructive">
              !
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[70dvh] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Notificaciones</h2>
          <button
            type="button"
            className="btn btn-ghost text-xs"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? "Actualizando…" : "Actualizar"}
          </button>
        </div>
        {isLoading || !ready ? (
          <p role="status" className="text-sm">
            Consultando avisos…
          </p>
        ) : isError ? (
          <p role="alert" className="text-sm text-destructive">
            No se pudieron consultar las notificaciones. Presiona Actualizar para reintentar.
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
              {count} sin leer
            </p>
            {unread.length > 0 && (
              <button
                className="btn btn-secondary mb-3 w-full text-sm"
                type="button"
                onClick={() => markRead(unread.map((notice) => notice.key))}
              >
                <CheckCheck aria-hidden="true" />
                Marcar todas como leídas
              </button>
            )}
            {visible.length ? (
              <ul className="space-y-3">
                {visible.map((notice) => (
                  <li key={notice.key} className="space-y-2 rounded-lg border p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p>{notice.message}</p>
                      {!readKeys.includes(notice.key) && (
                        <button
                          type="button"
                          className="btn btn-ghost shrink-0 p-2"
                          aria-label={`Marcar como leída: ${notice.message}`}
                          onClick={() => markRead([notice.key])}
                        >
                          <X aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    {readKeys.includes(notice.key) ? (
                      <span className="text-xs text-muted-foreground">
                        Leída · pendiente aún vigente
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="text-sm font-semibold underline"
                        onClick={() => markRead([notice.key])}
                      >
                        Marcar como leída
                      </button>
                    )}
                    {notice.key !== "stock" && canViewOrders && (
                      <a
                        className="btn btn-secondary w-full text-sm"
                        href={
                          notice.key === "receipts"
                            ? "/compras#recepciones"
                            : "/compras#por-aprobar"
                        }
                        onClick={() => markRead([notice.key])}
                      >
                        {notice.key === "receipts"
                          ? "Revisar recepciones"
                          : "Revisar órdenes por aprobar"}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {notices.length
                  ? "No tienes notificaciones sin leer."
                  : "No hay avisos pendientes."}
              </p>
            )}
            {readKeys.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost mt-3 w-full text-sm"
                onClick={() => setShowRead(!showRead)}
              >
                {showRead ? "Ocultar avisos leídos" : "Ver avisos leídos"}
              </button>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
