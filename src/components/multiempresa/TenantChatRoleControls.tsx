import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/lib/multiempresa/database.types";

/** Role management is staged until real Auth + MFA end-to-end tests. */
export const TENANT_CHAT_SETTINGS_WRITES_ENABLED = false;

const db = supabase as unknown as SupabaseClient<Database>;
const roles = ["ADMIN", "GERENCIA", "GERENTE", "BODEGA", "VENTAS", "VENTA"];

export function TenantChatRoleControls({ companyId }: { companyId: string }) {
  const settings = useQuery({
    queryKey: ["tenant", companyId, "chat-role-settings"],
    queryFn: async () => {
      const { data, error } = await db.from("tenant_chat_role_settings")
        .select("role_code,enabled")
        .eq("company_id", companyId);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 0,
  });

  return (
    <details className="basis-full rounded border border-slate-200 bg-white p-3 text-sm">
      <summary className="cursor-pointer font-semibold">Permisos del chat por perfil</summary>
      <p className="mt-2 text-slate-600">
        Como en Contemar, Administración decide qué perfiles pueden utilizar el chat.
        La modificación permanece deshabilitada hasta validar las cuentas Auth y MFA.
      </p>
      {settings.isPending && <p role="status" className="mt-2">Cargando permisos…</p>}
      {settings.isError && <p role="alert" className="mt-2 text-red-700">No se pudieron consultar los permisos del chat.</p>}
      {settings.isSuccess && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {roles.map((role) => {
            const enabled = settings.data.some((entry) => entry.role_code === role && entry.enabled);
            return (
              <label key={role} className="flex items-center gap-2 rounded border p-2">
                <input type="checkbox" checked={enabled} disabled={!TENANT_CHAT_SETTINGS_WRITES_ENABLED}
                  readOnly aria-label={`Chat del perfil ${role}`} />
                <span>{role}</span>
              </label>
            );
          })}
        </div>
      )}
    </details>
  );
}
