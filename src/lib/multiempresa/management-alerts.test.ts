import { describe, expect, it } from "vitest";
import { tenantManagementAlerts } from "./management-alerts";

const sample = { pendingApproval: 2, pendingReceipt: 3, criticalProducts: 4 };

describe("company-specific management notifications", () => {
  it("shows approval reminders and critical stock to management", () => {
    expect(tenantManagementAlerts("GERENCIA", sample).map((item) => item.id)).toEqual(["approvals", "critical"]);
  });
  it("shows pending receipts and critical stock to company admins", () => {
    expect(tenantManagementAlerts("ADMIN", sample).map((item) => item.id)).toEqual(["receipts", "critical"]);
  });
  it("does not expose management alerts to warehouse or sales users", () => {
    expect(tenantManagementAlerts("BODEGA", sample)).toEqual([]);
    expect(tenantManagementAlerts("VENTAS", sample)).toEqual([]);
  });
  it("hides alerts with zero counts", () => {
    expect(tenantManagementAlerts("GERENTE", { ...sample, pendingApproval: 0, criticalProducts: 0 })).toEqual([]);
  });
});
