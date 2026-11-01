import { describe, it, expect } from "vitest";
import {
  roleNotices,
  receivesRoleNotifications,
  notificationSummarySchema,
} from "@/lib/role-notifications";
const all = { approvals_pending: true, receipts_pending: true, low_stock: true };
describe("role-specific notifications", () => {
  it("shows only approval and stock notices to management", () => {
    expect(roleNotices("GERENCIA", all).map((n) => n.key)).toEqual(["approvals", "stock"]);
    expect(roleNotices(" GERENTE ", all).map((n) => n.key)).toEqual(["approvals", "stock"]);
  });
  it("shows only pending receipt and stock notices to admin", () =>
    expect(roleNotices("ADMIN", all).map((n) => n.key)).toEqual(["receipts", "stock"]));
  it("does not show notices to other roles", () => {
    for (const role of ["BODEGA", "VENTAS", "ADMINPRO", "", "ADMIN_1"]) {
      expect(receivesRoleNotifications(role)).toBe(false);
      expect(roleNotices(role, all)).toEqual([]);
    }
  });
  it("removes notices after pending conditions are resolved", () =>
    expect(
      roleNotices("ADMIN", { approvals_pending: false, receipts_pending: false, low_stock: false }),
    ).toEqual([]));
  it("rejects incomplete summaries and strips product details", () => {
    expect(notificationSummarySchema.safeParse({ low_stock: true }).success).toBe(false);
    expect(notificationSummarySchema.parse({ ...all, products: [{ name: "Private" }] })).toEqual(
      all,
    );
  });
});
