export type PurchasePrice = {
  id: string;
  product_id: string;
  unit: string;
  unit_price: number;
  created_at: string;
  purchase_key: string;
  movement_ids: string[];
  movement_prices: Record<string, number>;
  sequence: number;
  quantity: number;
};
export type PriceMovement = {
  id: string;
  product_id: string;
  type: string;
  unit_cost: number | null;
  measure_unit: string | null;
  created_at: string;
  quantity: number;
  quantity_value: number | null;
  purchase_order_id: string | null;
  batch_id: string | null;
  supplier_id: string | null;
  document_type: string | null;
  folio: number | null;
};
export type PriceItem = {
  id: string;
  product_id: string;
  unit_price: number;
  unit: string;
  created_at: string;
  quantity: number;
  stock_movement_id: string | null;
  purchase_entry_id: string;
};
export type PriceEntry = { id: string; cancelled_at: string | null };
export function normalizePriceUnit(unit: string) {
  const value = unit.trim().replace(/\s+/g, " ").toLocaleUpperCase("es-CL");
  const aliases: Record<string, string> = {
    UNIDAD: "UN",
    UNIDADES: "UN",
    UND: "UN",
    UD: "UN",
    METRO: "MT",
    METROS: "MT",
    M: "MT",
    LITRO: "LT",
    LITROS: "LT",
    L: "LT",
    KILO: "KG",
    KILOS: "KG",
    KILOGRAMO: "KG",
    KILOGRAMOS: "KG",
  };
  return aliases[value] ?? value;
}
export const formatPurchaseUnitPrice = (value: number) =>
  "$ " + value.toLocaleString("es-CL", { maximumFractionDigits: 2 });
export function priceDirection(current: number, previous: number | undefined) {
  if (
    previous === undefined ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    current < 0 ||
    previous < 0
  )
    return null;
  const diff = Math.round(current * 100) - Math.round(previous * 100);
  return diff < 0 ? "down" : diff > 0 ? "up" : "same";
}
export function buildPurchasePrices(
  movements: PriceMovement[],
  items: PriceItem[],
  entries: PriceEntry[],
) {
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const itemsByMovement = new Map(
    items.filter((i) => i.stock_movement_id).map((i) => [i.stock_movement_id!, i]),
  );
  const candidates: PurchasePrice[] = [];
  for (const m of movements) {
    const item = itemsByMovement.get(m.id);
    const entry = item ? entryById.get(item.purchase_entry_id) : undefined;
    if (m.type !== "entrada" || (item && (!entry || entry.cancelled_at))) continue;
    if (
      !item &&
      !m.purchase_order_id &&
      !m.supplier_id &&
      !["factura", "guia_despacho"].includes(m.document_type ?? "")
    )
      continue;
    const unit = item?.unit || m.measure_unit || "";
    const price = item?.unit_price ?? m.unit_cost;
    if (!unit || price == null || !Number.isFinite(Number(price)) || Number(price) < 0) continue;
    candidates.push({
      id: m.id,
      product_id: m.product_id,
      unit,
      unit_price: Number(price),
      created_at: m.created_at,
      purchase_key: m.purchase_order_id
        ? "oc:" + m.purchase_order_id
        : item
          ? "entry:" + item.purchase_entry_id
          : "batch:" + (m.batch_id ?? m.id),
      movement_ids: [m.id],
      movement_prices: { [m.id]: Number(price) },
      sequence: m.folio ?? 0,
      quantity: Number(m.quantity_value ?? m.quantity),
    });
  }
  // A linked item is represented by its live movement. Never revive removed/cancelled movements.
  for (const i of items) {
    const entry = entryById.get(i.purchase_entry_id);
    if (
      i.stock_movement_id ||
      !entry ||
      entry.cancelled_at ||
      !i.unit ||
      !Number.isFinite(Number(i.unit_price)) ||
      Number(i.unit_price) < 0
    )
      continue;
    candidates.push({
      id: i.id,
      product_id: i.product_id,
      unit: i.unit,
      unit_price: Number(i.unit_price),
      created_at: i.created_at,
      purchase_key: "entry:" + i.purchase_entry_id,
      movement_ids: [],
      movement_prices: {},
      sequence: 0,
      quantity: Number(i.quantity),
    });
  }
  const groups = new Map<string, PurchasePrice>();
  for (const r of candidates) {
    const key = JSON.stringify([r.product_id, normalizePriceUnit(r.unit), r.purchase_key]);
    const old = groups.get(key);
    if (!old) {
      groups.set(key, { ...r, movement_ids: [...r.movement_ids] });
      continue;
    }
    const quantity = old.quantity + r.quantity;
    const first =
      r.created_at < old.created_at || (r.created_at === old.created_at && r.id < old.id) ? r : old;
    groups.set(key, {
      ...first,
      unit_price:
        quantity > 0
          ? (old.unit_price * old.quantity + r.unit_price * r.quantity) / quantity
          : old.unit_price,
      quantity,
      movement_ids: [...old.movement_ids, ...r.movement_ids],
      movement_prices: { ...old.movement_prices, ...r.movement_prices },
    });
  }
  return [...groups.values()].sort(
    (a, b) =>
      b.created_at.localeCompare(a.created_at) ||
      b.sequence - a.sequence ||
      b.id.localeCompare(a.id),
  );
}
export function productPurchases(rows: PurchasePrice[], productId: string, unit: string) {
  const normalized = normalizePriceUnit(unit);
  return rows.filter(
    (r) => r.product_id === productId && normalizePriceUnit(r.unit) === normalized,
  );
}
export function previousPurchase(
  rows: PurchasePrice[],
  productId: string,
  unit: string,
  options: {
    movementId?: string | undefined;
    purchaseKey?: string | undefined;
    before?: string | undefined;
  } = {},
) {
  const list = productPurchases(rows, productId, unit);
  const index = list.findIndex((r) =>
    options.movementId
      ? r.movement_ids.includes(options.movementId)
      : !!options.purchaseKey && r.purchase_key === options.purchaseKey,
  );
  if (index >= 0) return list[index + 1];
  if (options.movementId) return undefined;
  return list.find(
    (r) =>
      r.purchase_key !== options.purchaseKey && (!options.before || r.created_at < options.before),
  );
}
