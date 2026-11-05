import { describe, expect, it } from "vitest";
import { summarizeTenantCubicationDocument, type TenantDocumentLine } from "./cubication-document";

const base: TenantDocumentLine = {
  id: "1",
  name: "Material",
  category: "Estructura",
  unit: "unidad",
  quantity: 3,
  stock: 8,
  unitCost: 1200,
  isSpecial: false,
};
describe("read-only tenant cubication document values", () => {
  it("sums ordinary and special costs by category without inventing special stock", () => {
    const result = summarizeTenantCubicationDocument([
      base,
      {
        ...base,
        id: "2",
        name: "Especial",
        category: "Detalle",
        isSpecial: true,
        stock: null,
        quantity: 2,
        unitCost: 3000,
      },
    ]);
    expect(result.total).toBe(9600);
    expect(result.groups).toHaveLength(2);
  });
  it("warns about costs not registered", () => {
    expect(summarizeTenantCubicationDocument([{ ...base, unitCost: 0 }]).missingPrices).toBe(1);
  });
  it("refuses invalid material values rather than showing misleading totals", () => {
    expect(() => summarizeTenantCubicationDocument([{ ...base, quantity: -1 }])).toThrow();
  });
});
