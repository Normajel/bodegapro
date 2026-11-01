import { describe, expect, it } from "vitest";
import { getPurchaseDeliveryStatus } from "@/lib/purchase-delivery";

describe("getPurchaseDeliveryStatus", () => {
  it("distinguishes no dispatch, in-time, soon, and overdue deliveries", () => {
    expect(
      getPurchaseDeliveryStatus({ dueDate: null, pendingQuantity: 2, today: "2026-03-01" }),
    ).toBe("sin_envio");
    expect(
      getPurchaseDeliveryStatus({
        dueDate: "2026-03-05",
        pendingQuantity: 2,
        today: "2026-03-01",
      }),
    ).toBe("en_plazo");
    expect(
      getPurchaseDeliveryStatus({
        dueDate: "2026-03-03",
        pendingQuantity: 2,
        today: "2026-03-01",
      }),
    ).toBe("por_vencer");
    expect(
      getPurchaseDeliveryStatus({
        dueDate: "2026-02-28",
        pendingQuantity: 2,
        today: "2026-03-01",
      }),
    ).toBe("vencida");
  });

  it("prioritizes completion, authorized closure, and cancellation over dates", () => {
    expect(
      getPurchaseDeliveryStatus({
        dueDate: "2026-02-28",
        pendingQuantity: 0,
        today: "2026-03-01",
      }),
    ).toBe("completa");
    expect(
      getPurchaseDeliveryStatus({
        dueDate: "2026-02-28",
        pendingQuantity: 5,
        today: "2026-03-01",
        closed: true,
      }),
    ).toBe("cerrada");
    expect(
      getPurchaseDeliveryStatus({
        dueDate: "2026-02-28",
        pendingQuantity: 5,
        today: "2026-03-01",
        cancelled: true,
      }),
    ).toBe("anulada");
  });

  it("treats the due date itself as due soon and rejects malformed dates", () => {
    expect(
      getPurchaseDeliveryStatus({
        dueDate: "2026-03-01",
        pendingQuantity: 1,
        today: "2026-03-01",
      }),
    ).toBe("por_vencer");
    expect(
      getPurchaseDeliveryStatus({
        dueDate: "invalid",
        pendingQuantity: 1,
        today: "2026-03-01",
      }),
    ).toBe("sin_envio");
  });
});
