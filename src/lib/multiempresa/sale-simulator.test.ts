import { describe, expect, it } from "vitest";
import { simulateTenantSaleScenario, type SaleScenarioItem } from "./sale-simulator";

const products = [
  { id: "p1", name: "Perno", category: "Estructura", unit: "unidad", available: 10, unitCost: 100, active: true },
  { id: "p2", name: "Pintura", category: "Pintura", unit: "litro", available: 5, unitCost: 1000, active: true },
];
const ordinary: SaleScenarioItem = {
  key: "a", kind: "normal", documentId: "cub1", unitCode: "M1", modules: 3,
  lines: [{ productId: "p1", quantity: 2 }],
};
describe("consolidated sale scenario", () => {
  it("aggregates shared materials across distinct units before subtracting stock once", () => {
    const result = simulateTenantSaleScenario([
      ordinary, { ...ordinary, key: "b", documentId: "cub2", unitCode: "M2", modules: 3 },
    ], products);
    expect(result.totalModules).toBe(6);
    expect(result.normalRows[0]?.required).toBe(12);
    expect(result.normalRows[0]?.missing).toBe(2);
    expect(result.normalShortageCost).toBe(200);
  });
  it("does not treat special products as stocked and sums their purchase cost", () => {
    const result = simulateTenantSaleScenario([
      ordinary, {
        key: "c", kind: "especial", documentId: "special1", unitCode: "X", modules: 2,
        lines: [{ productId: "sp", quantity: 3, name: "Artefacto", unitCost: 4000 }],
      },
    ], products);
    expect(result.specialRows[0]?.required).toBe(6);
    expect(result.specialAcquisitionCost).toBe(24000);
    expect(result.estimatedAcquisitionCost).toBe(24000);
  });
  it("rejects incorrect quantities, reused keys and excess modules", () => {
    expect(() => simulateTenantSaleScenario([ordinary, ordinary], products)).toThrow();
    expect(() => simulateTenantSaleScenario([{ ...ordinary, modules: 0 }], products)).toThrow();
    expect(() => simulateTenantSaleScenario([{ ...ordinary, modules: 1001 }], products)).toThrow();
  });
  it("refuses mismatched special price per product rather than guessing", () => {
    const entry = (key: string, cost: number): SaleScenarioItem => ({
      key, kind: "especial", documentId: key, unitCode: key, modules: 1,
      lines: [{ productId: "sp", quantity: 1, unitCost: cost }],
    });
    expect(() => simulateTenantSaleScenario([entry("a", 100), entry("b", 200)], products)).toThrow();
  });
  it("does not conceal unknown normal product references", () => {
    const result = simulateTenantSaleScenario([
      { ...ordinary, lines: [{ productId: "unknown", quantity: 1 }] },
    ], products);
    expect(result.missingReferences).toEqual(["unknown"]);
    expect(result.normalAvailabilityCovered).toBe(false);
  });
});
