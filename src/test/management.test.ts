import { describe, expect, it } from "vitest";
import {
  canViewManagement,
  cubicationRequirements,
  simulateCubication,
  summarizeManagement,
  categoryInventoryBreakdown,
  managementFlowSeries,
  type ManagementProduct,
} from "@/lib/management";
import { hasPermission } from "@/lib/permissions";
const p: ManagementProduct = {
  id: "a",
  name: "Plancha",
  category: "ESTRUCTURA",
  unit: "UN",
  active: true,
  stock: 999,
  stock_quantity: 60,
  min_stock: 10,
  unit_cost: 1000,
};
describe("Panel gerencial", () => {
  it("restricts access by assigned role, never by username or a forged permission", () => {
    for (const role of ["GERENCIA", "GERENTE"])
      expect(canViewManagement(role, { management: { view: true } })).toBe(true);
    expect(canViewManagement("ADMIN", { management: { view: true } })).toBe(true);
    expect(canViewManagement("ADMIN", {})).toBe(false);
    for (const role of ["BODEGA", "VENTAS", "ADMINPRO", "Admin_1", "Gerencia_1", undefined]) {
      expect(canViewManagement(role, { management: { view: true } })).toBe(false);
      expect(hasPermission(role, { management: { view: true } }, "management")).toBe(false);
    }
    expect(hasPermission("ADMIN", { management: { view: false } }, "management")).toBe(false);
    expect(hasPermission("GERENCIA", {}, "management", "edit")).toBe(false);
  });
  it("uses current stock rather than legacy stock and separates heterogeneous units", () => {
    const result = summarizeManagement(
      [p, { ...p, id: "b", unit: "MT", stock_quantity: 5, unit_cost: 200 }],
      [],
      "",
      "",
    );
    expect(result.stockValue).toBe(61000);
    expect(result.critical).toHaveLength(1);
  });
  it("aggregates requirements before subtracting availability once", () => {
    const [r] = cubicationRequirements(
      [
        { product_id: "a", quantity: 70 },
        { product_id: "a", quantity: 30 },
      ],
      [p],
    );
    expect(r!.required).toBe(100);
    expect(r!.missing).toBe(40);
    expect(r!.shortageCost).toBe(40000);
    expect(cubicationRequirements([{ product_id: "a", quantity: 30 }], [p])[0]!.missing).toBe(0);
  });
  it("scales material requirements without multiplying existing stock", () => {
    const scenario = simulateCubication(
      [{ product_id: "a", quantity: 2 }, { product_id: "a", quantity: 1 }],
      [{ ...p, stock_quantity: 10, unit_cost: 500 }],
      4,
    );
    expect(scenario.rows).toHaveLength(1);
    expect(scenario.rows[0]).toMatchObject({
      required: 12,
      available: 10,
      missing: 2,
      estimatedCost: 6000,
      shortageCost: 1000,
    });
    expect(scenario.coverageByValue).toBeCloseTo(83.333, 2);
    expect(scenario.maxModules).toBe(3);
    expect(scenario.missingProducts).toHaveLength(1);
  });
  it("marks unpriced material costs and unknown products as incomplete", () => {
    const scenario = simulateCubication(
      [{ product_id: "a", quantity: 2 }, { product_id: "not-found", quantity: 2 }],
      [{ ...p, unit_cost: 0, stock_quantity: 0 }],
      2,
    );
    expect(scenario.unknownProductIds).toEqual(["not-found"]);
    expect(scenario.unpriced).toHaveLength(1);
    expect(scenario.coverageByValue).toBeNull();
    expect(scenario.maxModules).toBe(0);
  });
  it("does not claim production capability when a template has no usable materials", () => {
    const scenario = simulateCubication([], [p], 1);
    expect(scenario.maxModules).toBe(0);
    expect(scenario.rows).toEqual([]);
  });
  it("sorts categories by value and counts critical and unpriced SKUs", () => {
    const result = categoryInventoryBreakdown([
      p,
      { ...p, id: "b", category: "PINTURA", stock_quantity: 5, unit_cost: 200, min_stock: 10 },
      { ...p, id: "c", category: "PINTURA", stock_quantity: 2, unit_cost: 0, min_stock: 3 },
      { ...p, id: "d", category: "OTRA", active: false },
    ]);
    expect(result.rows.map((row) => row.name)).toEqual(["ESTRUCTURA", "PINTURA"]);
    expect(result.rows[1]).toMatchObject({ productCount: 2, criticalCount: 2, unpricedCount: 1, value: 1000 });
    expect(result.rows[0]!.share).toBeCloseTo(60000 / 61000 * 100);
  });
  it("fills zero-activity days and calculates net and cumulative values correctly", () => {
    const days = [
      { name: "2026-11-01", Entradas: 500, Salidas: 100 },
      { name: "2026-11-03", Entradas: 0, Salidas: 300 },
    ];
    expect(managementFlowSeries(days, "2026-11-01", "2026-11-03")).toEqual([
      { name: "2026-11-01", Entradas: 500, Salidas: 100, Neto: 400 },
      { name: "2026-11-02", Entradas: 0, Salidas: 0, Neto: 0 },
      { name: "2026-11-03", Entradas: 0, Salidas: 300, Neto: -300 },
    ]);
    expect(managementFlowSeries(days, "2026-11-01", "2026-11-03", true)[2]).toEqual(
      { name: "2026-11-03", Entradas: 500, Salidas: 400, Neto: 100 },
    );
  });
  it("does not price historical movements at current costs or include unrelated categories", () => {
    const movements = [
      {
        id: "m",
        product_id: "a",
        type: "salida",
        quantity: 2,
        quantity_value: 2,
        unit_cost: null,
        created_at: "2026-11-01T02:00:00Z",
      },
    ];
    const r = summarizeManagement([p], movements, "", "");
    expect(r.exitsValue).toBe(0);
    expect(r.missingCosts).toBe(1);
    expect(r.trend[0]!.name).toBe("2026-10-31");
    expect(summarizeManagement([p], movements, "PINTURA", "").trend).toEqual([]);
    expect(
      summarizeManagement([p], [{ ...movements[0]!, unit_cost: 400 }], "", "").exitsValue,
    ).toBe(800);
  });
});
