import { describe, it, expect } from "vitest";
import { deliveryState, santiagoDay, type DeliveryRow } from "@/lib/purchase-delivery";
const row: DeliveryRow = {
  status: "pendiente",
  approval_status: "aprobada",
  product_lines: 1,
  pending_quantity: 10,
  received_quantity: 0,
  due_date: "2026-11-05",
  completed_at: null,
  sent_at: "2026-10-31T23:00:00Z",
};
describe("delivery calendar and partial receipts", () => {
  it("does not start a deadline before sending", () =>
    expect(deliveryState({ ...row, sent_at: null }, "2026-11-10").key).toBe("unsent"));
  it("keeps partial pending orders late", () =>
    expect(
      deliveryState(
        { ...row, status: "parcial", received_quantity: 5, pending_quantity: 5 },
        "2026-11-06",
      ),
    ).toMatchObject({ key: "late", late: true, label: "Entrega parcial · Fuera de plazo" }));
  it("allows the entire due day in Santiago", () =>
    expect(deliveryState(row, "2026-11-05")).toMatchObject({ key: "soon", late: false }));
  it("classifies upcoming and in-time orders", () => {
    expect(deliveryState(row, "2026-11-03").key).toBe("soon");
    expect(deliveryState(row, "2026-11-02").key).toBe("on_time");
  });
  it("does not mark service-only orders overdue", () =>
    expect(deliveryState({ ...row, product_lines: 0 }, "2026-12-01").key).toBe("service"));
  it("preserves completion lateness after the receipt", () =>
    expect(
      deliveryState(
        { ...row, status: "completa", pending_quantity: 0, completed_at: "2026-11-07T13:00:00Z" },
        "2026-12-01",
      ),
    ).toMatchObject({ key: "complete", late: true }));
  it("does not invent timing for historical completions", () =>
    expect(
      deliveryState({ ...row, status: "completa", pending_quantity: 0, completed_at: null }).label,
    ).toContain("sin registro"));
  it("uses Chile calendar days instead of UTC midnight", () =>
    expect(santiagoDay("2026-11-06T01:00:00Z")).toBe("2026-11-05"));
  it("keeps cancelled orders out of overdue counts", () =>
    expect(deliveryState({ ...row, status: "anulada" }, "2026-12-01")).toMatchObject({
      key: "cancelled",
      late: false,
    }));
});

describe("missing deadline explanations", () => {
  it("distinguishes missing configuration from missing sending evidence", async () => {
    const { deliveryDeadlineLabel } = await import("@/lib/purchase-delivery");
    expect(
      deliveryDeadlineLabel({ ...row, due_date: null, sent_at: null, delivery_days: null }),
    ).toBe("Faltan plazo y envío registrado");
    expect(deliveryDeadlineLabel({ ...row, due_date: null, sent_at: null, delivery_days: 7 })).toBe(
      "Falta registrar el envío",
    );
    expect(deliveryDeadlineLabel({ ...row, due_date: null, delivery_days: null })).toBe(
      "Falta configurar el plazo",
    );
    expect(
      deliveryDeadlineLabel({ ...row, due_date: null, pending_quantity: 0, delivery_days: null }),
    ).toBe("Sin fecha límite histórica");
  });
});
