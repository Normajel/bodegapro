import { NumericInput } from "@/components/numeric-input";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  DISPATCH_METHODS,
  manualDispatchTimestamp,
  santiagoLocalDateTime,
} from "@/lib/manual-dispatch";
import { displayDate } from "@/lib/purchase-delivery";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
type Order = Database["public"]["Tables"]["purchase_orders"]["Row"];
export function ManualDispatchDialog({
  order,
  onClose,
  onSaved,
}: {
  order: Order;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const [sentAt, setSentAt] = useState(() => santiagoLocalDateTime());
  const [recipient, setRecipient] = useState(order.sent_to ?? "");
  const [method, setMethod] = useState("correo_externo");
  const [notes, setNotes] = useState("");
  const [days, setDays] = useState(order.delivery_days == null ? "" : String(order.delivery_days));
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!confirmed) return;
    setSaving(true);
    try {
      const timestamp = manualDispatchTimestamp(sentAt);
      if (
        !recipient.trim() ||
        !Number.isInteger(Number(days)) ||
        days === "" ||
        Number(days) < 0 ||
        Number(days) > 3650
      )
        throw new Error("Revisa destinatario y plazo de entrega");
      const { error } = await supabase.rpc("record_manual_purchase_dispatch", {
        p_order_id: order.id,
        p_request_id: requestId,
        p_sent_at: timestamp,
        p_recipient: recipient.trim(),
        p_method: method,
        p_notes: notes.trim(),
        p_delivery_days: Number(days),
      });
      if (error) throw error;
      await Promise.all(
        [
          ["purchase-orders"],
          ["purchase-delivery-summary"],
          ["purchase-email-events", order.id],
          ["role-notifications"],
        ].map((queryKey) => qc.invalidateQueries({ queryKey })),
      );
      toast.success("Envío manual registrado. Se conserva la primera fecha de envío.");
      (onSaved ?? onClose)();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : ((error as { message?: string })?.message ?? "No se pudo registrar el envío"),
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent
        onEscapeKeyDown={(event) => {
          if (saving) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (saving) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>OC enviada · {order.order_number}</DialogTitle>
          <DialogDescription>
            Registra un envío ya realizado por otro medio. Esta acción no envía correos ni
            productos.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={save}>
          {order.sent_at && (
            <p className="rounded border p-3 text-sm">
              Primer envío: {displayDate(order.sent_at)}. Este registro se agrega al historial y no
              reinicia el plazo.
            </p>
          )}
          <label className="label">
            Fecha y hora de envío (Chile)
            <input
              className="input"
              type="datetime-local"
              required
              value={sentAt}
              onChange={(e) => setSentAt(e.target.value)}
              max={santiagoLocalDateTime()}
              disabled={saving}
            />
          </label>
          <label className="label">
            Medio de envío
            <select
              className="input"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              disabled={saving}
            >
              {Object.entries(DISPATCH_METHODS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Destinatario o contacto
            <input
              className="input"
              required
              maxLength={320}
              placeholder="Correo, número o persona que recibió la OC"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              disabled={saving}
            />
          </label>
          <label className="label">
            Plazo de entrega (días corridos)
            <NumericInput
              className="input"
              type="number"
              required
              min={0}
              max={3650}
              step={1}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              disabled={saving || !!order.sent_at}
            />
          </label>
          <label className="label">
            Observaciones
            <textarea
              className="input"
              rows={3}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={saving}
            />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              required
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={saving}
              className="mt-1"
            />
            Confirmo que esta OC ya fue enviada en la fecha indicada.
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn btn-secondary" type="button" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button className="btn btn-primary" type="submit" disabled={saving || !confirmed}>
              {saving ? "Guardando…" : "Registrar OC enviada"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
