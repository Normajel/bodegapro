import { z } from "zod";
export const notificationSummarySchema = z.object({
  approvals_pending: z.boolean(),
  receipts_pending: z.boolean(),
  low_stock: z.boolean(),
});
export type NotificationSummary = z.infer<typeof notificationSummarySchema>;
export function receivesRoleNotifications(role: string | null | undefined) {
  return ["ADMIN", "GERENCIA", "GERENTE"].includes(role?.trim().toUpperCase() ?? "");
}
export function roleNotices(role: string, summary: NotificationSummary) {
  const notices: { key: string; message: string }[] = [];
  const normalized = role.trim().toUpperCase();
  if (!receivesRoleNotifications(normalized)) return notices;
  if (["GERENCIA", "GERENTE"].includes(normalized) && summary.approvals_pending)
    notices.push({ key: "approvals", message: "Debe aprobar órdenes de compra pendientes." });
  if (normalized === "ADMIN" && summary.receipts_pending)
    notices.push({ key: "receipts", message: "Hay productos no recepcionados." });
  if (summary.low_stock) notices.push({ key: "stock", message: "Hay productos bajo stock." });
  return notices;
}
