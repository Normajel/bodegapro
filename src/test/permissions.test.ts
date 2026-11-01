import { describe, it, expect } from "vitest";
import { hasPermission, canReceivePurchaseOrder, canApprovePurchaseOrder } from "@/lib/permissions";
const gerencia = {
  purchases: { view: true, create: false, edit: false, delete: false },
  movements: { view: true, create: false, edit: false, delete: false },
  inventory: { view: true, create: false, edit: false, delete: false },
};
const bodega = {
  purchases: { view: true, create: false, edit: false, delete: false },
  movements: { view: true, create: true, edit: false, delete: false },
  inventory: { view: true, create: true, edit: false, delete: false },
};
describe("explicit role authorization", () => {
  it("denies missing, JSON null and string-valued permissions", () => {
    expect(hasPermission("OTRO", {}, "purchases", "create")).toBe(false);
    expect(hasPermission("OTRO", null, "purchases", "edit")).toBe(false);
    expect(hasPermission("OTRO", { purchases: { edit: null } }, "purchases", "edit")).toBe(false);
    expect(hasPermission("OTRO", { purchases: { edit: "true" } }, "purchases", "edit")).toBe(false);
  });
  it("allows Gerencia to view and approve without creating, editing, deleting or receiving", () => {
    expect(canApprovePurchaseOrder("GERENCIA", gerencia)).toBe(true);
    expect(canReceivePurchaseOrder("GERENCIA", gerencia)).toBe(false);
    for (const action of ["create", "edit", "delete"]) {
      expect(hasPermission("GERENCIA", gerencia, "purchases", action)).toBe(false);
      expect(hasPermission("GERENCIA", gerencia, "movements", action)).toBe(false);
    }
    expect(hasPermission("GERENCIA", gerencia, "movements", "view")).toBe(true);
  });
  it("allows Bodega to receive without granting purchase edit or approval", () => {
    expect(canReceivePurchaseOrder("BODEGA", bodega)).toBe(true);
    expect(canApprovePurchaseOrder("BODEGA", bodega)).toBe(false);
    for (const module of ["inventory", "purchases", "movements"])
      for (const action of ["edit", "delete"])
        expect(hasPermission("BODEGA", bodega, module, action)).toBe(false);
  });
  it("denies receiving if either required read or movement permission is missing", () => {
    expect(canReceivePurchaseOrder("BODEGA", { purchases: { view: true } })).toBe(false);
    expect(canReceivePurchaseOrder("BODEGA", { movements: { create: true } })).toBe(false);
    expect(canReceivePurchaseOrder(undefined, bodega)).toBe(false);
  });
  it("does not allow another role to approve or receive even with unrelated permissions", () => {
    expect(canApprovePurchaseOrder("VENTA", bodega)).toBe(false);
    expect(canReceivePurchaseOrder("VENTA", bodega)).toBe(false);
  });
  it("keeps administrator actions available in the MFA-protected application", () => {
    expect(canApprovePurchaseOrder("ADMIN", {})).toBe(true);
    expect(canReceivePurchaseOrder("ADMINPRO", {})).toBe(true);
  });
});
