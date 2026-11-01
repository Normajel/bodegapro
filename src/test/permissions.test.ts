import { describe, it, expect } from "vitest";
import {
  hasPermission,
  canReceivePurchaseOrder,
  canApprovePurchaseOrder,
  canSendPurchaseOrder,
  effectiveRolePermission,
  canEditRolePermission,
  updateRolePermission,
} from "@/lib/permissions";
const gerencia = {
  purchases: { view: true, create: false, edit: false, delete: false, approve: true },
  movements: { view: true, create: false, edit: false, delete: false },
  inventory: { view: true, create: false, edit: false, delete: false },
};
const bodega = {
  purchases: { view: true, create: false, edit: false, delete: false, receive: true },
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

describe("role editor and explicit purchase actions", () => {
  it("honors revoked approval and receipt actions even with other prerequisites", () => {
    expect(
      canApprovePurchaseOrder("GERENCIA", {
        ...gerencia,
        purchases: { ...gerencia.purchases, approve: false },
      }),
    ).toBe(false);
    expect(canApprovePurchaseOrder("GERENCIA", { purchases: { view: true } })).toBe(false);
    expect(
      canReceivePurchaseOrder("BODEGA", {
        ...bodega,
        purchases: { ...bodega.purchases, receive: false },
      }),
    ).toBe(false);
    expect(canReceivePurchaseOrder("BODEGA", { ...bodega, purchases: { view: true } })).toBe(false);
  });
  it("requires view, edit and an explicit email permission", () => {
    expect(canSendPurchaseOrder("OTRO", { purchases: { view: true, edit: true } })).toBe(false);
    expect(
      canSendPurchaseOrder("OTRO", { purchases: { view: true, edit: true, send: true } }),
    ).toBe(true);
    expect(
      canSendPurchaseOrder("OTRO", { purchases: { view: true, edit: false, send: true } }),
    ).toBe(false);
  });
  it("keeps privileged access and ineligible actions read-only", () => {
    expect(effectiveRolePermission("ADMIN", {}, "platform", "manage")).toBe(false);
    expect(effectiveRolePermission("ADMINPRO", {}, "platform", "manage")).toBe(true);
    expect(effectiveRolePermission("ADMIN", {}, "settings", "manage")).toBe(true);
    expect(canEditRolePermission("ADMIN", "inventory", "view")).toBe(false);
    expect(canEditRolePermission("GERENCIA", "settings", "manage")).toBe(false);
    expect(canEditRolePermission("BODEGA", "purchases", "approve")).toBe(false);
    expect(canEditRolePermission("GERENCIA", "purchases", "receive")).toBe(false);
    expect(canEditRolePermission("GERENCIA", "purchases", "approve")).toBe(true);
  });
  it("keeps receipt dependencies consistent without mutating the source", () => {
    const source = {
      purchases: { view: true, receive: false },
      movements: { view: true, create: false },
    };
    const enabled = updateRolePermission(source, "purchases", "receive", true);
    expect(source.movements.create).toBe(false);
    expect(canReceivePurchaseOrder("BODEGA", enabled)).toBe(true);
    expect(
      updateRolePermission(enabled, "movements", "create", false)["purchases"]?.["receive"],
    ).toBe(false);
  });
  it("clears subordinate actions when viewing or editing is revoked", () => {
    const value = updateRolePermission({}, "purchases", "send", true);
    expect(canSendPurchaseOrder("OTRO", value)).toBe(true);
    expect(updateRolePermission(value, "purchases", "edit", false)["purchases"]?.["send"]).toBe(
      false,
    );
    const hidden = updateRolePermission(
      { purchases: { view: true, approve: true, receive: true, send: true, edit: true } },
      "purchases",
      "view",
      false,
    );
    expect(Object.values(hidden["purchases"] ?? {}).every((value) => !value)).toBe(true);
  });
});
