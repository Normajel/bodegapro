import { dateKey } from "./warehouse";

export function canViewManagement(role: string | null | undefined, permissions: unknown) {
  const allowed = ["ADMIN", "GERENCIA", "GERENTE"].includes(role?.trim().toUpperCase() ?? "");
  const value = permissions as { management?: { view?: boolean } } | null;
  return allowed && value?.management?.view === true;
}
export type ManagementProduct = {
  id: string;
  name: string;
  category: string;
  unit: string;
  active: boolean;
  stock: number;
  stock_quantity: number | null;
  min_stock: number;
  unit_cost: number;
};
export type ManagementMovement = {
  id: string;
  product_id: string;
  type: string;
  quantity: number;
  quantity_value: number;
  unit_cost: number | null;
  created_at: string;
};
export const numberValue = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
export const stockOf = (p: ManagementProduct) => numberValue(p.stock_quantity ?? p.stock);

export function summarizeManagement(
  products: ManagementProduct[],
  movements: ManagementMovement[],
  category: string,
  productId: string,
) {
  const selected = products.filter(
    (p) => (!category || p.category === category) && (!productId || p.id === productId),
  );
  const byId = new Map(selected.map((p) => [p.id, p]));
  const active = selected.filter((p) => p.active);
  const categories = new Map<string, number>();
  for (const p of active)
    categories.set(
      p.category || "Sin categoría",
      (categories.get(p.category || "Sin categoría") ?? 0) + stockOf(p) * numberValue(p.unit_cost),
    );
  const days = new Map<string, { name: string; Entradas: number; Salidas: number }>();
  const exits = new Map<string, number>();
  let missingCosts = 0;
  for (const m of movements) {
    const p = byId.get(m.product_id);
    if (!p) continue;
    if (m.unit_cost == null) missingCosts++;
    // Never substitute today's cost for a missing historical cost.
    const value = numberValue(m.quantity_value ?? m.quantity) * numberValue(m.unit_cost);
    const day = dateKey(m.created_at);
    const row = days.get(day) ?? { name: day, Entradas: 0, Salidas: 0 };
    if (m.type === "entrada") row.Entradas += value;
    if (m.type === "salida") {
      row.Salidas += value;
      exits.set(p.id, (exits.get(p.id) ?? 0) + value);
    }
    days.set(day, row);
  }
  const trend = [...days.values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    active,
    selected,
    missingCosts,
    stockValue: active.reduce((sum, p) => sum + stockOf(p) * numberValue(p.unit_cost), 0),
    critical: active.filter((p) => stockOf(p) <= numberValue(p.min_stock)),
    unpriced: active.filter((p) => stockOf(p) > 0 && numberValue(p.unit_cost) <= 0).length,
    categories: [...categories].map(([name, value]) => ({ name, value })),
    trend,
    entriesValue: trend.reduce((sum, r) => sum + r.Entradas, 0),
    exitsValue: trend.reduce((sum, r) => sum + r.Salidas, 0),
    topExits: [...exits]
      .map(([id, value]) => ({ name: byId.get(id)!.name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10),
  };
}

export function cubicationRequirements(
  items: { product_id: string; quantity: number }[],
  products: ManagementProduct[],
) {
  const quantities = new Map<string, number>();
  for (const item of items)
    quantities.set(
      item.product_id,
      (quantities.get(item.product_id) ?? 0) + numberValue(item.quantity),
    );
  return products
    .filter((p) => quantities.has(p.id))
    .map((p) => {
      const required = quantities.get(p.id)!;
      const available = Math.max(0, stockOf(p));
      const missing = Math.max(0, required - available);
      return {
        ...p,
        required,
        available,
        missing,
        estimatedCost: required * numberValue(p.unit_cost),
        shortageCost: missing * numberValue(p.unit_cost),
      };
    });
}
