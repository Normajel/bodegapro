import { describe, expect, it } from "vitest";
import {
  canViewManagement,
  cubicationRequirements,
  summarizeManagement,
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
    for (const role of ["ADMIN", "GERENCIA", "GERENTE"])
      expect(canViewManagement(role, {})).toBe(true);
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
