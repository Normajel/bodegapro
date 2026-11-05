export type DashboardProduct = {
  id: string;
  category: string;
  active: boolean;
  stock_quantity: number;
  min_stock: number;
  unit_cost: number;
};
export type DashboardMovement = {
  id: string;
  type: string;
  quantity: number;
  created_at: string;
};
export type DashboardOrder = {
  id: string;
  order_kind: string;
  status: string;
  approval_status: string;
  total_amount: number;
};

const numeric = (value: number): number =>
  Number.isFinite(Number(value)) ? Number(value) : 0;

/** Counts movements by quantity, not CLP: historical prices may be unavailable. */
export function tenantMovementSeries(
  movements: readonly DashboardMovement[],
  cumulative = false,
) {
  const days = new Map<string, { date: string; Entradas: number; Salidas: number }>();
  for (const movement of movements) {
    const date = movement.created_at.slice(0, 10);
    if (!/^\d{4}-\d\d-\d\d$/.test(date)) continue;
    const row = days.get(date) ?? { date, Entradas: 0, Salidas: 0 };
    if (movement.type === "entrada") row.Entradas += numeric(movement.quantity);
    if (movement.type === "salida") row.Salidas += numeric(movement.quantity);
    days.set(date, row);
  }
  const ordered = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!cumulative) return ordered;
  let entries = 0;
  let exits = 0;
  return ordered.map((day) => {
    entries += day.Entradas;
    exits += day.Salidas;
    return { date: day.date, Entradas: entries, Salidas: exits };
  });
}

export function summarizeTenantManagement(
  products: readonly DashboardProduct[],
  orders: readonly DashboardOrder[],
  movements: readonly DashboardMovement[],
  category = "",
) {
  const selected = products.filter((product) => product.active && (!category || product.category === category));
  const inventoryValue = selected.reduce(
    (sum, product) => sum + numeric(product.stock_quantity) * numeric(product.unit_cost), 0,
  );
  const categoryValues = new Map<string, number>();
  for (const product of selected) {
    const key = product.category || "Sin categoría";
    categoryValues.set(key, (categoryValues.get(key) ?? 0) + numeric(product.stock_quantity) * numeric(product.unit_cost));
  }
  const pendingApproval = orders.filter(
    (order) => order.status !== "anulada" && order.approval_status === "por_aprobar",
  );
  const pendingReceipt = orders.filter(
    (order) => order.order_kind === "producto" &&
      order.approval_status === "aprobada" &&
      (order.status === "pendiente" || order.status === "parcial"),
  );
  const acceptedServices = orders.filter(
    (order) => order.order_kind === "servicio" && order.status === "ACEPTADO",
  );
  const orderGroups = [
    { name: "Por aprobar", count: pendingApproval.length },
    { name: "Pendiente de recepción", count: pendingReceipt.length },
    { name: "Servicios aceptados", count: acceptedServices.length },
    { name: "Productos recibidos", count: orders.filter((order) => order.order_kind === "producto" && order.status === "completa").length },
    { name: "Anuladas", count: orders.filter((order) => order.status === "anulada").length },
  ];
  return {
    activeProducts: selected.length,
    inventoryValue,
    criticalProducts: selected.filter((product) => numeric(product.stock_quantity) <= numeric(product.min_stock)).length,
    noCostProducts: selected.filter((product) => numeric(product.stock_quantity) > 0 && numeric(product.unit_cost) <= 0).length,
    pendingApproval: pendingApproval.length,
    pendingReceipt: pendingReceipt.length,
    acceptedServices: acceptedServices.length,
    orderGroups,
    categoryValues: [...categoryValues].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    entries: movements.filter((m) => m.type === "entrada").reduce((sum, m) => sum + numeric(m.quantity), 0),
    exits: movements.filter((m) => m.type === "salida").reduce((sum, m) => sum + numeric(m.quantity), 0),
  };
}
