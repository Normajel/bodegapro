import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CurrentAccess } from "@/lib/permissions";
import {
  notificationSummarySchema,
  receivesRoleNotifications,
  roleNotices,
} from "@/lib/role-notifications";
export function RoleNotifications({ access }: { access: CurrentAccess }) {
  const enabled = receivesRoleNotifications(access.name);
  const announced = useRef(new Set<string>());
  const lastRole = useRef(access.name);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["role-notifications", access.name],
    enabled,
    staleTime: 15000,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_role_notifications");
      if (error) throw error;
      return notificationSummarySchema.parse(data);
    },
  });
  const notices = data ? roleNotices(access.name, data) : [];
  useEffect(() => {
    if (lastRole.current !== access.name) {
      announced.current.clear();
      lastRole.current = access.name;
    }
    if (!enabled || !data || isError) return;
    const active = roleNotices(access.name, data);
    const activeKeys = new Set(active.map((notice) => notice.key));
    for (const key of announced.current) if (!activeKeys.has(key)) announced.current.delete(key);
    for (const notice of active) {
      if (!announced.current.has(notice.key)) {
        toast.warning(notice.message, {
          id: `role-notice-${access.name}-${notice.key}`,
          duration: 7000,
        });
        announced.current.add(notice.key);
      }
    }
  }, [access.name, data, enabled, isError]);
  if (!enabled) return null;
  const count = isError ? 0 : notices.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="btn btn-ghost relative h-11 w-11 shrink-0 p-2"
          aria-label={
            isError ? "Notificaciones no disponibles" : `Notificaciones: ${count} avisos activos`
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
        className="max-h-[70dvh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto"
      >
        <h2 className="mb-3 font-semibold">Notificaciones</h2>
        {isLoading ? (
          <p role="status" className="text-sm">
            Consultando avisos…
          </p>
        ) : isError ? (
          <p role="alert" className="text-sm text-destructive">
            No se pudieron consultar las notificaciones. Intenta nuevamente al recargar.
          </p>
        ) : notices.length ? (
          <ul className="space-y-2">
            {notices.map((notice) => (
              <li key={notice.key} className="rounded-lg border bg-muted/40 p-3 text-sm">
                {notice.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No hay avisos pendientes.</p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Los avisos se actualizan mientras usas la aplicación. El aviso de stock no muestra el
          listado de productos.
        </p>
      </PopoverContent>
    </Popover>
  );
}
