import { describe, expect, it } from "vitest";
import { summarizeTenantManagement, tenantMovementSeries } from "./management-summary";

describe("tenant-specific management summaries", () => {
  const products = [
    {
      id: "a",
      category: "Pintura",
      active: true,
      stock_quantity: 5,
      min_stock: 2,
      unit_cost: 1000,
    },
    {
      id: "b",
      category: "Pintura",
      active: true,
      stock_quantity: 1,
      min_stock: 3,
      unit_cost: 2000,
    },
    { id: "c", category: "Pisos", active: true, stock_quantity: 2, min_stock: 0, unit_cost: 0 },
  ];
  const orders = [
    {
      id: "1",
      order_kind: "producto",
      status: "pendiente",
      approval_status: "por_aprobar",
      total_amount: 100,
    },
    {
      id: "2",
      order_kind: "producto",
      status: "parcial",
      approval_status: "aprobada",
      total_amount: 200,
    },
    {
      id: "3",
      order_kind: "servicio",
      status: "ACEPTADO",
      approval_status: "aprobada",
      total_amount: 300,
    },
    {
      id: "4",
      order_kind: "producto",
      status: "anulada",
      approval_status: "por_aprobar",
      total_amount: 400,
    },
  ];
  const movements = [
    { id: "1", type: "entrada", quantity: 3, created_at: "2026-11-01T12:00:00Z" },
    { id: "2", type: "salida", quantity: 2, created_at: "2026-11-01T13:00:00Z" },
    { id: "3", type: "entrada", quantity: 4, created_at: "2026-11-02T12:00:00Z" },
  ];
  it("summarizes valuation and excludes cancelled orders from approvals", () => {
    const sum = summarizeTenantManagement(products, orders, movements);
    expect(sum.inventoryValue).toBe(7000);
    expect(sum.criticalProducts).toBe(1);
    expect(sum.noCostProducts).toBe(1);
    expect(sum.pendingApproval).toBe(1);
    expect(sum.pendingReceipt).toBe(1);
    expect(sum.acceptedServices).toBe(1);
  });
  it("filters inventory by category", () => {
    const sum = summarizeTenantManagement(products, orders, movements, "Pintura");
    expect(sum.inventoryValue).toBe(7000);
    expect(sum.activeProducts).toBe(2);
  });
  it("keeps movements as quantities rather than inventing historical CLP values", () => {
    expect(tenantMovementSeries(movements)).toEqual([
      { date: "2026-11-01", Entradas: 3, Salidas: 2 },
      { date: "2026-11-02", Entradas: 4, Salidas: 0 },
    ]);
    expect(tenantMovementSeries(movements, true)[1]).toEqual({
      date: "2026-11-02",
      Entradas: 7,
      Salidas: 2,
    });
  });
});
