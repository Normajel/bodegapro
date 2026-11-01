import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Status = {
  domain: string;
  from_email: string;
  enabled: boolean;
  key_configured: boolean;
  domain_status: string;
  checked_at: string | null;
  updated_at: string;
  revision: number;
  dns_records: { type: string; name: string; value: string; status: string; priority?: number }[];
  audit: { action: string; created_at: string; enabled: boolean }[];
};
const queryKey = ["platform-email-settings"];
async function invoke(body: Record<string, unknown>): Promise<Status> {
  const { data, error } = await supabase.functions.invoke("platform-email-settings", { body });
  if (error) {
    let message = "No se pudo consultar la configuración de correo.";
    try {
      message = (await error.context?.json())?.message ?? message;
    } catch {
      /* No credentials or provider errors are displayed. */
    }
    throw new Error(message);
  }
  if (!data || data.message) throw new Error(data?.message ?? "Respuesta inválida.");
  return data;
}
export function PlatformEmailSettings() {
  const qc = useQueryClient();
  const [domain, setDomain] = useState("");
  const [from, setFrom] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => invoke({ action: "status" }),
    retry: false,
  });
  useEffect(() => {
    if (data) {
      setDomain(data.domain);
      setFrom(data.from_email);
    }
  }, [data]);
  const changed =
    domain.trim().toLowerCase() !== data?.domain ||
    from.trim().toLowerCase() !== data?.from_email ||
    !!apiKey;
  async function act(action: "save" | "verify" | "enable" | "disable") {
    if (!data) return;
    setBusy(true);
    // Remove the key from component state immediately after submitting; never persist it in a cache.
    const submittedKey = apiKey;
    setApiKey("");
    try {
      const status = await invoke({
        action,
        revision: data.revision,
        ...(action === "save"
          ? { domain, from_email: from, ...(submittedKey ? { api_key: submittedKey } : {}) }
          : {}),
      });
      qc.setQueryData(queryKey, status);
      toast.success(
        action === "enable"
          ? "Envío de correo activado"
          : action === "disable"
            ? "Envío de correo desactivado"
            : action === "verify"
              ? status.domain_status === "verified"
                ? "Dominio verificado para envío"
                : "Verificación solicitada. Revisa los registros DNS y vuelve a consultar."
              : "Conexión guardada. Verifica el dominio antes de activar el envío.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la configuración");
      await refetch();
    } finally {
      setBusy(false);
    }
  }
  const labels: Record<string, string> = {
    save: "Conexión guardada",
    verify: "Dominio comprobado",
    enable: "Envío activado",
    disable: "Envío desactivado",
  };
  return (
    <section className="card space-y-4 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <Mail className="mt-1 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h2 className="font-semibold">Correo de órdenes de compra</h2>
          <p className="text-sm text-muted-foreground">
            Configura el remitente compartido de BodegaPro. Cada empresa se identificará con su
            nombre y recibirá las respuestas en su propio correo.
          </p>
        </div>
      </div>
      {isLoading ? (
        <p>Cargando configuración…</p>
      ) : error ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-destructive">{error.message}</p>
          <button type="button" className="btn btn-secondary" onClick={() => void refetch()}>
            Volver a consultar
          </button>
        </div>
      ) : (
        data && (
          <>
            <div className="flex flex-wrap gap-3 rounded-lg border p-3 text-sm">
              <span>
                Servicio: <strong>{data.enabled ? "Activo" : "Inactivo"}</strong>
              </span>
              <span>
                Dominio:{" "}
                <strong>
                  {data.domain_status === "verified"
                    ? "Verificado"
                    : data.key_configured
                      ? "Pendiente de verificar"
                      : "Sin configurar"}
                </strong>
              </span>
              <span>
                Clave:{" "}
                <strong>{data.key_configured ? "Guardada y protegida" : "Sin configurar"}</strong>
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              1. Registra tu dominio en Resend. 2. Guarda aquí la conexión. 3. Copia los registros
              DNS en tu proveedor de dominio. 4. Verifica y activa el envío.
            </p>
            <form
              autoComplete="off"
              onSubmit={(e) => {
                e.preventDefault();
                void act("save");
              }}
            >
              <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="mail-domain">
                    Dominio de envío
                  </label>
                  <input
                    id="mail-domain"
                    className="input"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="correo.tudominio.cl"
                    maxLength={253}
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="mail-from">
                    Correo remitente compartido
                  </label>
                  <input
                    id="mail-from"
                    type="email"
                    className="input"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    placeholder="ordenes@correo.tudominio.cl"
                    maxLength={254}
                    autoCapitalize="none"
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="mail-key">
                    Clave privada de Resend
                  </label>
                  <input
                    id="mail-key"
                    type="password"
                    className="input"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    autoComplete="new-password"
                    spellCheck={false}
                    maxLength={210}
                    placeholder={
                      data.key_configured ? "Deja vacío para conservar la clave guardada" : "re_…"
                    }
                    required={!data.key_configured}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Necesita permisos para consultar y verificar dominios y para enviar correo. La
                    clave guardada nunca se vuelve a mostrar.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <button type="submit" className="btn btn-primary">
                    {busy ? "Procesando…" : "Guardar conexión"}
                  </button>
                </div>
              </fieldset>
            </form>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || changed || !data.key_configured}
                onClick={() => void act("verify")}
              >
                Verificar dominio
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  busy ||
                  changed ||
                  !data.key_configured ||
                  data.enabled ||
                  data.domain_status !== "verified"
                }
                onClick={() => void act("enable")}
              >
                Activar envío
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || !data.enabled}
                onClick={() => void act("disable")}
              >
                Desactivar envío
              </button>
            </div>
            {changed && (
              <p className="text-xs text-muted-foreground">
                Guarda los cambios antes de verificar o activar. Guardar una conexión deja el
                servicio inactivo hasta que lo actives.
              </p>
            )}
            {data.checked_at && (
              <p className="text-xs text-muted-foreground">
                Última comprobación: {new Date(data.checked_at).toLocaleString("es-CL")}
              </p>
            )}
            {data.dns_records.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold">Registros DNS del dominio</h3>
                <p className="text-xs text-muted-foreground">
                  Agrégalos en el administrador DNS de tu dominio. BodegaPro no modifica tus
                  registros DNS.
                </p>
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Tipo</th>
                        <th>Nombre</th>
                        <th>Valor</th>
                        <th>Prioridad</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.dns_records.map((r, i) => (
                        <tr key={i}>
                          <td>{r.type}</td>
                          <td className="break-all">{r.name}</td>
                          <td className="max-w-md break-all select-all">{r.value}</td>
                          <td>{r.priority ?? "—"}</td>
                          <td>{r.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {data.audit.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold">Últimos cambios</h3>
                <ul className="space-y-1 text-sm">
                  {data.audit.map((entry, i) => (
                    <li key={i}>
                      {new Date(entry.created_at).toLocaleString("es-CL")} ·{" "}
                      {labels[entry.action] ?? entry.action}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )
      )}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        Acceso exclusivo del propietario ADMINPRO con segundo factor. Credenciales cifradas en el
        servidor.
      </p>
    </section>
  );
}
