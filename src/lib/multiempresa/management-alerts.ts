export type TenantManagementAlert = {
  id: "approvals" | "receipts" | "critical";
  label: string;
  count: number;
};

export function tenantManagementAlerts(
  role: string | null | undefined,
  summary: { pendingApproval: number; pendingReceipt: number; criticalProducts: number },
): TenantManagementAlert[] {
  const upper = role?.trim().toUpperCase();
  if (!["ADMIN", "ADMINPRO", "GERENCIA", "GERENTE"].includes(upper ?? "")) return [];
  const result: TenantManagementAlert[] = [];
  if (summary.pendingApproval > 0 && (upper === "GERENCIA" || upper === "GERENTE")) {
    result.push({ id: "approvals", label: "Órdenes de compra pendientes de aprobación", count: summary.pendingApproval });
  }
  if (summary.pendingReceipt > 0 && (upper === "ADMIN" || upper === "ADMINPRO")) {
    result.push({ id: "receipts", label: "Órdenes de productos pendientes de recepción", count: summary.pendingReceipt });
  }
  if (summary.criticalProducts > 0) {
    result.push({ id: "critical", label: "Productos bajo stock mínimo o sin existencias", count: summary.criticalProducts });
  }
  return result;
}
