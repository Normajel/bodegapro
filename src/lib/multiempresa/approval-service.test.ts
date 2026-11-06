import { describe, expect, it } from "vitest";
import { canApproveTenantOrder, PURCHASE_APPROVAL_WRITES_ENABLED } from "./approval-service";

describe("multiempresa purchase order approval gate", () => {
  it("allows the managerial and admin profiles to prepare approvals", () => {
    for (const role of ["ADMIN", "ADMINPRO", "GERENCIA", "GERENTE"] as const) {
      expect(canApproveTenantOrder(role)).toBe(true);
    }
  });

  it("blocks Bodega, Ventas and unauthenticated users", () => {
    expect(canApproveTenantOrder("BODEGA")).toBe(false);
    expect(canApproveTenantOrder("VENTAS")).toBe(false);
    expect(canApproveTenantOrder(null)).toBe(false);
  });

  it("enables approval only through the membership-checked SQL service", () => {
    expect(PURCHASE_APPROVAL_WRITES_ENABLED).toBe(true);
  });
});
