import { NumericInput } from "@/components/numeric-input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { ManualDispatchDialog } from "@/components/manual-dispatch-dialog";
import { DISPATCH_METHODS } from "@/lib/manual-dispatch";
import { displayDate } from "@/lib/purchase-delivery";
type Order = Database["public"]["Tables"]["purchase_orders"]["Row"];
export function PurchaseOrderTracking({
  order,
  canSend,
  canEdit,
  onClose,
}: {
  order: Order;
  canSend: boolean;
  canEdit: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [manualOpen, setManualOpen] = useState(false);
  const [days, setDays] = useState(order.delivery_days == null ? "" : String(order.delivery_days));
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const requestId = useRef<string | null>(null);
  const { data: supplier } = useQuery({
    queryKey: ["supplier-order-info", order.supplier_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_supplier_order_info", {
        p_supplier_id: order.supplier_id,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
  const { data: company } = useQuery({
    queryKey: ["company-settings", "email-identity"],
    enabled: canSend,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("name, email")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: events = [], isError } = useQuery({
    queryKey: ["purchase-email-events", order.id],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_order_email_events")
        .select("*")
        .eq("purchase_order_id", order.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const pending = events.some((e) => e.status === "processing" || e.status === "unknown");
  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["purchase-email-events", order.id] }),
      qc.invalidateQueries({ queryKey: ["purchase-orders"] }),
      qc.invalidateQueries({ queryKey: ["purchase-delivery-summary"] }),
    ]);
  }
  async function saveDays() {
    setSaving(true);
    try {
      if (days === "" || !Number.isInteger(Number(days)) || Number(days) < 0 || Number(days) > 3650)
        throw new Error("Ingresa un plazo entero entre 0 y 3650 días");
      const { error } = await supabase
        .from("purchase_orders")
        .update({ delivery_days: Number(days) })
        .eq("id", order.id);
      if (error) throw error;
      await refresh();
      toast.success("Plazo de esta OC guardado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el plazo");
    } finally {
      setSaving(false);
    }
  }
  async function send() {
    setSending(true);
    try {
      requestId.current ??= crypto.randomUUID();
      const { data, error } = await supabase.functions.invoke("send-purchase-order", {
        body: { order_id: order.id, request_id: requestId.current },
      });
      if (error) {
        let message = error.message;
        try {
          const payload = await error.context?.json();
          message = payload?.message ?? message;
          if (payload?.status === "failed") requestId.current = null;
        } catch {
          /* Preserve request ID for safe retry after transport errors. */
        }
        throw new Error(message);
      }
      if (data?.status === "failed") requestId.current = null;
      if (data?.status !== "sent")
        throw new Error(
          data?.message ?? "El envío está pendiente de verificación. Revisa el historial.",
        );
      requestId.current = null;
      toast.success("PDF aceptado por el servicio de correo y envío registrado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo enviar la OC");
    } finally {
      await refresh();
      setSending(false);
    }
  }
  const labels: Record<string, string> = {
    processing: "En proceso",
    sent: "Enviado al servicio de correo",
    failed: "Fallido",
    unknown: "Por verificar",
    manual: "OC enviada · registro manual",
  };
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-foreground/40 p-4">
      <section
        className="card mx-auto my-6 max-w-3xl space-y-4 p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tracking-title"
      >
        <div className="flex justify-between">
          <h2 id="tracking-title" className="text-lg font-bold">
            Envío y trazabilidad · {order.order_number}
          </h2>
          <button className="btn btn-secondary" onClick={onClose} disabled={sending}>
            Cerrar
          </button>
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt>Creación</dt>
            <dd>{displayDate(order.created_at)}</dd>
          </div>
          <div>
            <dt>Aprobación</dt>
            <dd>{displayDate(order.approved_at)}</dd>
          </div>
          <div>
            <dt>Primer envío registrado</dt>
            <dd>{displayDate(order.sent_at)}</dd>
          </div>
          <div>
            <dt>Recepción completa</dt>
            <dd>{displayDate(order.completed_at)}</dd>
          </div>
        </dl>
        <div className="rounded border p-3">
          <label className="label">
            Plazo de esta OC (días corridos desde el primer envío)
            <NumericInput
              className="input"
              type="number"
              min="0"
              max="3650"
              step="1"
              value={days}
              disabled={!canEdit || !!order.sent_at || pending}
              onChange={(e) => setDays(e.target.value)}
            />
          </label>
          {canEdit && !order.sent_at && (
            <button
              className="btn btn-secondary mt-2"
              disabled={saving || pending}
              onClick={saveDays}
            >
              {saving ? "Guardando…" : "Guardar plazo"}
            </button>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Se conserva el plazo acordado; una entrega parcial o un reenvío no lo reinicia. Las OC
            antiguas pueden necesitar configurarlo.
          </p>
        </div>
        {canSend && order.approval_status === "aprobada" && order.status !== "anulada" && (
          <div className="space-y-2 rounded border p-3">
            <h3 className="font-semibold">Enviar PDF al proveedor</h3>
            <p>
              Para: <strong>{supplier?.email || "Proveedor sin correo registrado"}</strong>
            </p>
            <p>
              Empresa remitente:{" "}
              <strong>{company?.name || "Configura el nombre de tu empresa"}</strong> — vía
              BodegaPro
            </p>
            <p>
              Respuestas a: <strong>{company?.email || "Configura el correo de tu empresa"}</strong>
            </p>
            <p>Asunto: Orden de compra {order.order_number}</p>
            <p className="text-sm text-muted-foreground">
              Se adjuntará el PDF de la OC aprobada. El destinatario se toma de Contactos. El envío
              utiliza un remitente compartido de BodegaPro. Las respuestas llegarán al correo de tu
              empresa configurado en Configuración → Empresa.
            </p>
            <button
              className="btn btn-primary"
              disabled={
                sending ||
                pending ||
                !supplier?.email ||
                !company?.name?.trim() ||
                !company?.email?.trim()
              }
              onClick={send}
            >
              {sending ? "Enviando…" : order.sent_at ? "Reenviar PDF" : "Enviar PDF"}
            </button>
          </div>
        )}
        {canSend && order.approval_status === "aprobada" && order.status !== "anulada" && (
          <button type="button" className="btn btn-secondary" onClick={() => setManualOpen(true)}>
            OC enviada · registrar manualmente
          </button>
        )}
        {manualOpen && (
          <ManualDispatchDialog
            order={order}
            onClose={() => setManualOpen(false)}
            onSaved={() => {
              setManualOpen(false);
              onClose();
            }}
          />
        )}
        <h3 className="font-semibold">Historial de envíos</h3>
        <p className="text-xs text-muted-foreground">
          Los intentos fallidos no establecen fecha de envío. Los registros manuales indican una
          declaración del usuario, no una confirmación del servicio de correo.
        </p>
        {isError ? (
          <p role="alert">No se pudo cargar el historial.</p>
        ) : !events.length ? (
          <p className="text-sm text-muted-foreground">Sin intentos de envío registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Destinatario</th>
                  <th>Estado</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>{displayDate(e.sent_at ?? e.created_at)}</td>
                    <td>{e.recipient}</td>
                    <td>{labels[e.status] ?? e.status}</td>
                    <td>
                      {e.status === "manual"
                        ? `${DISPATCH_METHODS[e.dispatch_method as keyof typeof DISPATCH_METHODS] ?? "Medio externo"}${e.dispatch_notes ? " · " + e.dispatch_notes : ""} · Registrado: ${displayDate(e.created_at)}`
                        : (e.error_message ??
                          (e.provider_id ? "Referencia: " + e.provider_id : "—"))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
