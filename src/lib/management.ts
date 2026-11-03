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


/**
 * Scenario-only material planning. Does not reserve or mutate stock.
 * Aggregate duplicate template lines before comparing them with the on-hand stock.
 * Costs use current recorded unit costs, not historical purchase prices.
 */
export function simulateCubication(
  items: { product_id: string; quantity: number }[],
  products: ManagementProduct[],
  units: number,
) {
  const moduleCount = Number.isFinite(units) ? Math.max(1, Math.min(1000, Math.trunc(units))) : 1;
  const productIds = new Set(products.map((p) => p.id));
  const unknownProductIds = [...new Set(items.map((item) => item.product_id))]
    .filter((id) => !productIds.has(id));
  const rows = cubicationRequirements(
    items.map((item) => ({ ...item, quantity: numberValue(item.quantity) * moduleCount })),
    products,
  ).filter((p) => p.required > 0);
  const totalCost = rows.reduce((sum, p) => sum + p.estimatedCost, 0);
  const shortageCost = rows.reduce((sum, p) => sum + p.shortageCost, 0);
  const missingProducts = rows.filter((p) => p.missing > 0);
  const unpriced = rows.filter((p) => numberValue(p.unit_cost) <= 0);
  const pricedTotal = rows
    .filter((p) => numberValue(p.unit_cost) > 0)
    .reduce((sum, p) => sum + p.estimatedCost, 0);
  const pricedShortage = rows
    .filter((p) => numberValue(p.unit_cost) > 0)
    .reduce((sum, p) => sum + p.shortageCost, 0);
  const coverageByValue = pricedTotal > 0
    ? Math.max(0, Math.min(100, (1 - pricedShortage / pricedTotal) * 100))
    : null;
  const byCategory = new Map<string, number>();
  for (const row of rows) {
    const category = row.category || "Sin categoría";
    byCategory.set(category, (byCategory.get(category) ?? 0) + row.estimatedCost);
  }
  const maxModules = rows.length > 0 && unknownProductIds.length === 0
    ? Math.min(
        ...rows.map((p) => {
          const perModule = p.required / moduleCount;
          return perModule > 0 ? Math.floor(p.available / perModule) : 0;
        }),
      )
    : 0;
  return {
    moduleCount,
    rows,
    missingProducts,
    unpriced,
    unknownProductIds,
    totalCost,
    shortageCost,
    coveredCost: Math.max(0, totalCost - shortageCost),
    coverageByValue,
    maxModules: Math.max(0, maxModules),
    categories: [...byCategory].map(([name, value]) => ({ name, value }))
      .filter((entry) => entry.value > 0).sort((a, b) => b.value - a.value),
  };
}

/** Current inventory valuation grouped by category; excludes inactive products. */
export function categoryInventoryBreakdown(products: ManagementProduct[], category = "", productId = "") {
  const groups = new Map<string, { name: string; value: number; productCount: number; criticalCount: number; unpricedCount: number }>();
  for (const p of products) {
    if (!p.active || (category && p.category !== category) || (productId && p.id !== productId)) continue;
    const name = p.category || "Sin categoría";
    const row = groups.get(name) ?? { name, value: 0, productCount: 0, criticalCount: 0, unpricedCount: 0 };
    row.value += stockOf(p) * numberValue(p.unit_cost);
    row.productCount += 1;
    if (stockOf(p) <= numberValue(p.min_stock)) row.criticalCount += 1;
    if (stockOf(p) > 0 && numberValue(p.unit_cost) <= 0) row.unpricedCount += 1;
    groups.set(name, row);
  }
  const rows = [...groups.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return { rows: rows.map((row) => ({ ...row, share: total > 0 ? row.value / total * 100 : 0 })), total };
}

export type ManagementFlowDay = { name: string; Entradas: number; Salidas: number };
/** Adds zero-activity days and derives daily or running totals without treating entries as revenue. */
export function managementFlowSeries(days: ManagementFlowDay[], from: string, to: string, cumulative = false) {
  const byDay = new Map(days.map((day) => [day.name, day]));
  const result: Array<{ name: string; Entradas: number; Salidas: number; Neto: number }> = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return result;
  const start = new Date(from + "T12:00:00Z");
  const end = new Date(to + "T12:00:00Z");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return result;
  let totalIn = 0;
  let totalOut = 0;
  for (let day = start.getTime(), i = 0; day <= end.getTime() && i < 367; day += 86400000, i++) {
    const name = new Date(day).toISOString().slice(0, 10);
    const row = byDay.get(name);
    const entries = numberValue(row?.Entradas);
    const exits = numberValue(row?.Salidas);
    totalIn += entries;
    totalOut += exits;
    const inValue = cumulative ? totalIn : entries;
    const outValue = cumulative ? totalOut : exits;
    result.push({ name, Entradas: inValue, Salidas: outValue, Neto: inValue - outValue });
  }
  return result;
}
