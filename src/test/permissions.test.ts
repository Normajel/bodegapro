import { describe, expect, it } from "vitest";
import { canReceivePurchaseOrder } from "@/lib/permissions";

describe("canReceivePurchaseOrder", () => {
  it("allows BODEGA to receive without purchase edit permission", () => {
    expect(
      canReceivePurchaseOrder("BODEGA", {
        purchases: { view: true },
        movements: { create: true },
      }),
    ).toBe(true);
  });

  it("requires purchase view and movement creation permissions", () => {
    expect(
      canReceivePurchaseOrder("BODEGA", {
        purchases: { view: true },
        movements: { create: false },
      }),
    ).toBe(false);
    expect(
      canReceivePurchaseOrder("BODEGA", {
        movements: { create: true },
      }),
    ).toBe(false);
  });

  it("does not grant receiving access to other roles", () => {
    expect(
      canReceivePurchaseOrder("VENTA", {
        purchases: { view: true, edit: true },
        movements: { create: true },
      }),
    ).toBe(false);
  });
});
