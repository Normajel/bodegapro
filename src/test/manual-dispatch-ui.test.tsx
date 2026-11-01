import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { ManualDispatchDialog } from "@/components/manual-dispatch-dialog";
import type { Database } from "@/integrations/supabase/types";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invalidateQueries: vi.fn().mockResolvedValue(undefined),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
const order = {
  id: "qa-order",
  order_number: "OC-QA",
  sent_at: null,
  sent_to: null,
  delivery_days: 7,
} as Database["public"]["Tables"]["purchase_orders"]["Row"];
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("manual OC dispatch form", () => {
  it("requires confirmation and records through the guarded RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: "request-id", error: null });
    const close = vi.fn();
    render(<ManualDispatchDialog order={order} onClose={close} />);
    const save = screen.getByRole("button", { name: "Registrar OC enviada" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Destinatario o contacto"), {
      target: { value: "contacto@ejemplo.cl" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith(
        "record_manual_purchase_dispatch",
        expect.objectContaining({
          p_order_id: "qa-order",
          p_recipient: "contacto@ejemplo.cl",
          p_method: "correo_externo",
          p_delivery_days: 7,
        }),
      ),
    );
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
  it("cancels without making a record or sending email", () => {
    const close = vi.fn();
    render(<ManualDispatchDialog order={order} onClose={close} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(close).toHaveBeenCalledOnce();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("locks the original delivery term for resends", () => {
    render(
      <ManualDispatchDialog
        order={{ ...order, sent_at: "2026-11-01T20:00:00Z" }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByLabelText("Plazo de entrega (días corridos)")).toBeDisabled();
  });
});
