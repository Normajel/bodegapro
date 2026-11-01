import { describe, it, expect } from "vitest";
import {
  buildPurchasePrices,
  previousPurchase,
  productPurchases,
  priceDirection,
  normalizePriceUnit,
  type PriceMovement,
  type PriceItem,
} from "@/lib/purchase-prices";
const move = (
  id: string,
  price: number,
  date: string,
  patch: Partial<PriceMovement> = {},
): PriceMovement => ({
  id,
  product_id: "p",
  type: "entrada",
  unit_cost: price,
  measure_unit: "UN",
  created_at: date,
  quantity: 1,
  quantity_value: 1,
  purchase_order_id: null,
  batch_id: id,
  supplier_id: "s",
  document_type: "factura",
  folio: 1,
  ...patch,
});
const item = (patch: Partial<PriceItem> = {}): PriceItem => ({
  id: "i",
  product_id: "p",
  unit_price: 90,
  unit: "UN",
  created_at: "2026-10-01T10:00:00Z",
  quantity: 1,
  stock_movement_id: "m",
  purchase_entry_id: "e",
  ...patch,
});
describe("purchase price indicators", () => {
  it("recognizes equivalent unit labels without mixing packages", () => {
    expect(normalizePriceUnit("unidad")).toBe("UN");
    expect(normalizePriceUnit("METROS")).toBe("MT");
    expect(normalizePriceUnit("CAJA")).not.toBe("UN");
  });
  it("shows down, same, up and no baseline accurately", () => {
    expect(priceDirection(90, 100)).toBe("down");
    expect(priceDirection(100, 100)).toBe("same");
    expect(priceDirection(110, 100)).toBe("up");
    expect(priceDirection(100, undefined)).toBeNull();
  });
  it("compares cents consistently and supports zero-price purchases", () => {
    expect(priceDirection(0.1 + 0.2, 0.3)).toBe("same");
    expect(priceDirection(0, 10)).toBe("down");
    expect(priceDirection(10, 0)).toBe("up");
    expect(priceDirection(0, 0)).toBe("same");
    expect(priceDirection(NaN, 10)).toBeNull();
  });
  it("combines purchases from movements and legacy items without duplicating linked records", () => {
    const rows = buildPurchasePrices(
      [move("m", 100, "2026-10-01T10:00:00Z")],
      [item()],
      [{ id: "e", cancelled_at: null }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.unit_price).toBe(90);
    expect(rows[0]?.movement_prices["m"]).toBe(90);
  });
  it("excludes cancelled purchases even when their original entry movement remains", () => {
    expect(
      buildPurchasePrices(
        [move("m", 100, "2026-10-01")],
        [item()],
        [{ id: "e", cancelled_at: "2026-10-02" }],
      ),
    ).toHaveLength(0);
  });
  it("keeps unlinked legacy purchases, without reviving deleted linked movements", () => {
    const rows = buildPurchasePrices(
      [],
      [item(), item({ id: "legacy", stock_movement_id: null })],
      [{ id: "e", cancelled_at: null }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("legacy");
  });
  it("counts partial receipts of the same OC as one purchase and preserves its first receipt date", () => {
    const rows = buildPurchasePrices(
      [
        move("partial-late", 100, "2026-10-15", { purchase_order_id: "oc" }),
        move("new", 95, "2026-10-10"),
        move("partial-first", 100, "2026-10-01", { purchase_order_id: "oc" }),
      ],
      [],
      [],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe("new");
    expect(previousPurchase(rows, "p", "UN", { movementId: "partial-late" })).toBeUndefined();
    expect(previousPurchase(rows, "p", "UN", { movementId: "new" })?.unit_price).toBe(100);
  });
  it("compares across suppliers, while keeping units and products separate", () => {
    const rows = buildPurchasePrices(
      [
        move("new", 90, "2026-10-10", { supplier_id: "other" }),
        move("box", 500, "2026-10-09", { measure_unit: "CAJA" }),
        move("other-product", 1, "2026-10-08", { product_id: "other" }),
        move("old", 100, "2026-10-01", { measure_unit: " un " }),
      ],
      [],
      [],
    );
    expect(productPurchases(rows, "p", "UN")).toHaveLength(2);
    expect(previousPurchase(rows, "p", "UN", { movementId: "new" })?.id).toBe("old");
  });
  it("does not treat exits or inventory-only adjustments as purchases", () => {
    expect(
      buildPurchasePrices(
        [
          move("out", 10, "2026-10-01", { type: "salida" }),
          move("adjustment", 10, "2026-10-02", { supplier_id: null, document_type: null }),
        ],
        [],
        [],
      ),
    ).toHaveLength(0);
  });
  it("uses the previous actual purchase, excluding later purchases when viewing an unreceived old OC", () => {
    const rows = buildPurchasePrices(
      [move("later", 200, "2026-11-01"), move("older", 100, "2026-10-01")],
      [],
      [],
    );
    expect(
      previousPurchase(rows, "p", "UN", { purchaseKey: "oc:unreceived", before: "2026-10-15" })?.id,
    ).toBe("older");
    expect(previousPurchase(rows, "p", "UN", { movementId: "unknown" })).toBeUndefined();
  });
  it("uses a quantity-weighted purchase price for repeated product lines, preserving each line price", () => {
    const rows = buildPurchasePrices(
      [
        move("one", 100, "2026-10-01", { batch_id: "same", quantity_value: 1 }),
        move("two", 200, "2026-10-01", { batch_id: "same", quantity_value: 3 }),
      ],
      [],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.unit_price).toBe(175);
    expect(rows[0]?.movement_prices["one"]).toBe(100);
    expect(rows[0]?.movement_prices["two"]).toBe(200);
  });
});
