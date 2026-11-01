export type DeliveryRow = {
  status: string;
  approval_status: string;
  product_lines: number;
  pending_quantity: number;
  received_quantity: number;
  due_date: string | null;
  completed_at: string | null;
  sent_at: string | null;
};
export function santiagoDay(value: Date | string = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function deliveryState(row: DeliveryRow, today = santiagoDay()) {
  if (row.status === "anulada") return { key: "cancelled", label: "Anulada", late: false };
  if (!row.product_lines) return { key: "service", label: "Solo servicios", late: false };
  if (row.approval_status !== "aprobada")
    return { key: "approval", label: "Por aprobar", late: false };
  const partial = row.received_quantity > 0 ? "Entrega parcial · " : "";
  if (Number(row.pending_quantity) === 0) {
    const late =
      !!row.due_date && !!row.completed_at && santiagoDay(row.completed_at) > row.due_date;
    return {
      key: "complete",
      label: late
        ? "Recibida completa · fuera de plazo"
        : row.completed_at && row.due_date
          ? "Recibida completa · en plazo"
          : "Recibida completa · plazo sin registro",
      late,
    };
  }
  if (!row.sent_at) return { key: "unsent", label: partial + "Pendiente de envío", late: false };
  if (!row.due_date)
    return { key: "unconfigured", label: partial + "Plazo sin configurar", late: false };
  if (row.due_date < today) return { key: "late", label: partial + "Fuera de plazo", late: true };
  const days = Math.round(
    (Date.parse(row.due_date + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 86400000,
  );
  return {
    key: days <= 2 ? "soon" : "on_time",
    label: partial + (days <= 2 ? "Próxima a vencer" : "Dentro del plazo"),
    late: false,
  };
}
export const paymentTermsLabel = (value: string) =>
  (
    ({
      contado: "Contado",
      credito_10_dias: "Crédito 10 días",
      credito_30_dias: "Crédito 30 días",
      credito_60_dias: "Crédito 60 días",
      credito_90_dias: "Crédito 90 días",
    }) as Record<string, string>
  )[value] ?? value;
export function displayDate(value: string | null) {
  return value
    ? new Date(value.length === 10 ? value + "T12:00:00Z" : value).toLocaleString("es-CL", {
        timeZone: "America/Santiago",
        dateStyle: "short",
        ...(value.length === 10 ? {} : { timeStyle: "short" as const }),
      })
    : "—";
}
