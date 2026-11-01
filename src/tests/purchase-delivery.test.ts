import { describe, expect, it } from "vitest";
import { getPurchaseDeliveryStatus } from "@/lib/purchase-delivery";

describe("estado de plazo de entrega", () => {
  const today = "2026-11-01";

  it("mantiene separado el plazo de la recepción parcial", () => {
    expect(
      getPurchaseDeliveryStatus({
        dueDate: "2026-10-31",
        pendingQuantity: 40,
        today,
      }),
    ).toBe("vencida");
  });

  it("marca próxima a vencer dentro de dos días corridos", () => {
    expect(
      getPurchaseDeliveryStatus({
        dueDate: "2026-11-03",
        pendingQuantity: 1,
        today,
      }),
    ).toBe("por_vencer");
  });

  it("mantiene dentro de plazo las órdenes posteriores a la ventana de aviso", () => {
    expect(
      getPurchaseDeliveryStatus({
        dueDate: "2026-11-04",
        pendingQuantity: 1,
        today,
      }),
    ).toBe("en_plazo");
  });

  it("considera completa una orden sin saldo aunque conserve una fecha comprometida", () => {
    expect(
      getPurchaseDeliveryStatus({
        dueDate: "2026-10-31",
        pendingQuantity: 0,
        today,
      }),
    ).toBe("completa");
  });

  it("prioriza los estados terminales de cierre y anulación", () => {
    expect(
      getPurchaseDeliveryStatus({
        dueDate: "2026-10-31",
        pendingQuantity: 10,
        today,
        closed: true,
      }),
    ).toBe("cerrada");
    expect(
      getPurchaseDeliveryStatus({
        dueDate: "2026-10-31",
        pendingQuantity: 10,
        today,
        cancelled: true,
      }),
    ).toBe("anulada");
  });

  it("no marca vencida una orden sin envío/fecha comprometida", () => {
    expect(
      getPurchaseDeliveryStatus({
        dueDate: null,
        pendingQuantity: 1,
        today,
      }),
    ).toBe("sin_envio");
  });
});
