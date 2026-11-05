import { describe, expect, it } from "vitest";
import { simulateTenantCubication, simulateTenantSpecialCubication } from "./cubication-simulator";

const products = [
  {
    id: "p1",
    name: "Perno",
    category: "Estructura",
    unit: "unidad",
    available: 10,
    unitCost: 100,
    active: true,
  },
  {
    id: "p2",
    name: "Tabla",
    category: "Carpintería",
    unit: "unidad",
    available: 3,
    unitCost: 200,
    active: true,
  },
];

describe("tenant cubication simulation", () => {
  it("aggregates duplicated lines, counts buildable modules and computes shortages", () => {
    const result = simulateTenantCubication(
      [
        { productId: "p1", quantity: 2 },
        { productId: "p1", quantity: 1 },
        { productId: "p2", quantity: 2 },
      ],
      products,
      3,
    );
    expect(result.maxModules).toBe(1);
    expect(result.rows.find((row) => row.productId === "p1")?.required).toBe(9);
    expect(result.rows.find((row) => row.productId === "p2")?.missing).toBe(3);
    expect(result.shortageCost).toBe(600);
    expect(result.totalCost).toBe(2100);
  });
  it("does not silently ignore unknown or inactive products", () => {
    const result = simulateTenantCubication([{ productId: "unknown", quantity: 1 }], products, 2);
    expect(result.missingProductIds).toEqual(["unknown"]);
    expect(result.maxModules).toBe(0);
  });
  it("does not invent monetary coverage if costs are unknown", () => {
    const result = simulateTenantCubication(
      [{ productId: "p1", quantity: 2 }],
      [{ ...products[0]!, unitCost: 0 }],
      2,
    );
    expect(result.coveragePercent).toBeNull();
    expect(result.unpricedCount).toBe(1);
  });
  it("validates module count and material quantities", () => {
    expect(() =>
      simulateTenantCubication([{ productId: "p1", quantity: 1 }], products, 0),
    ).toThrow();
    expect(() =>
      simulateTenantCubication([{ productId: "p1", quantity: -1 }], products, 1),
    ).toThrow();
  });
  it("quotes special products as purchases, never as stocked materials", () => {
    const result = simulateTenantSpecialCubication(
      [{ productId: "sp1", name: "Artefacto", quantity: 2, unitCost: 5000 }],
      3,
    );
    expect(result.totalCost).toBe(30000);
    expect(result.rows[0]?.required).toBe(6);
    expect("maxModules" in result).toBe(false);
  });
});
