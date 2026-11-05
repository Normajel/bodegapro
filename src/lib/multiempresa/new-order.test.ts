import { describe, expect, it } from "vitest";
import { prepareNewOrder, type NewOrderDraft } from "./new-order";

const suppliers = [
  { id: "supplier-products", supplier_kind: "productos" },
  { id: "supplier-services", supplier_kind: "servicios" },
];
const products = [{ id: "p1", name: "Perno", unit: "unidad", active: true }];
const base: NewOrderDraft = {
  companyId: "company-a",
  kind: "producto",
  supplierId: "supplier-products",
  orderNumber: " OC-100 ",
  paymentTerms: "30 días",
  notes: "",
  lines: [
    { productId: "p1", description: "Perno", unit: "unidad", quantity: "5", unitCost: "1000" },
  ],
};

describe("prepareNewOrder", () => {
  it("calculates net, VAT and total in CLP", () => {
    const result = prepareNewOrder(base, suppliers, products);
    expect(result.netTotal).toBe(5000);
    expect(result.vatAmount).toBe(950);
    expect(result.totalAmount).toBe(5950);
    expect(result.orderNumber).toBe("OC-100");
  });
  it("accepts service-only lines", () => {
    const order = {
      ...base,
      kind: "servicio" as const,
      supplierId: "supplier-services",
      lines: [
        {
          productId: "",
          description: "Instalación",
          unit: "servicio",
          quantity: "2",
          unitCost: "10000",
        },
      ],
    };
    expect(prepareNewOrder(order, suppliers, products).items[0]?.product_id).toBeNull();
  });
  it("rejects invalid supplier, mixed line, decimals, zero and repeated products", () => {
    expect(() =>
      prepareNewOrder({ ...base, supplierId: "supplier-services" }, suppliers, products),
    ).toThrow();
    expect(() => prepareNewOrder({ ...base, kind: "servicio" }, suppliers, products)).toThrow();
    for (const quantity of ["0", "-1", "1.5", ""]) {
      expect(() =>
        prepareNewOrder({ ...base, lines: [{ ...base.lines[0]!, quantity }] }, suppliers, products),
      ).toThrow();
    }
    expect(() =>
      prepareNewOrder({ ...base, lines: [base.lines[0]!, base.lines[0]!] }, suppliers, products),
    ).toThrow();
  });
});
