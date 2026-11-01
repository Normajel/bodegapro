export type PurchaseDeliveryStatus =
  "sin_envio" | "en_plazo" | "por_vencer" | "vencida" | "completa" | "cerrada" | "anulada";

type PurchaseDeliveryInput = {
  dueDate: string | null;
  pendingQuantity: number;
  today: string;
  closed?: boolean;
  cancelled?: boolean;
  daysUntilDue?: number;
};

function dayNumber(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return Math.floor(Date.UTC(Number(year), Number(month) - 1, Number(day)) / 86_400_000);
}

export function getPurchaseDeliveryStatus({
  dueDate,
  pendingQuantity,
  today,
  closed = false,
  cancelled = false,
  daysUntilDue = 2,
}: PurchaseDeliveryInput): PurchaseDeliveryStatus {
  if (cancelled) return "anulada";
  if (closed) return "cerrada";
  if (pendingQuantity <= 0) return "completa";
  if (!dueDate) return "sin_envio";

  const dueDay = dayNumber(dueDate);
  const todayDay = dayNumber(today);
  if (dueDay === null || todayDay === null) return "sin_envio";

  const daysRemaining = dueDay - todayDay;
  if (daysRemaining < 0) return "vencida";
  if (daysRemaining <= daysUntilDue) return "por_vencer";
  return "en_plazo";
}
