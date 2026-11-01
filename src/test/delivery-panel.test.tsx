import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { DeliveryPanel } from "@/components/delivery-panel";
const mocks = vi.hoisted(() => ({
  result: { data: [] as Record<string, unknown>[], isLoading: false, isError: false },
  single: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => mocks.result }));
vi.mock("@/lib/permissions", () => ({
  useAppAccess: () => ({ name: "BODEGA", permissions: {} }),
  hasPermission: (_role: string, _p: unknown, _module: string, action: string) => action === "view",
  canSendPurchaseOrder: () => false,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }) },
}));
vi.mock("@/components/purchase-order-tracking", () => ({
  PurchaseOrderTracking: ({ canEdit, canSend }: { canEdit: boolean; canSend: boolean }) => (
    <div role="dialog">
      Editar: {String(canEdit)} · Enviar: {String(canSend)}
    </div>
  ),
}));
const unsent = {
  id: "order-1",
  order_number: "OC-1",
  approval_status: "aprobada",
  status: "parcial",
  product_lines: 2,
  ordered_quantity: 35,
  received_quantity: 10,
  pending_quantity: 25,
  due_date: null,
  delivery_days: null,
  sent_at: null,
  completed_at: null,
};
afterEach(() => {
  cleanup();
  mocks.result = { data: [], isLoading: false, isError: false };
  vi.clearAllMocks();
});
describe("delivery panel missing tracking and mobile detail", () => {
  it("explains why incomplete records cannot be counted as on time or late", () => {
    mocks.result.data = [unsent];
    render(<DeliveryPanel />);
    expect(
      screen.getByText("1 OC pendientes aún no tienen fecha límite calculable."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1 sin envío registrado · 1 sin plazo configurado/),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Faltan plazo y envío registrado")).toHaveLength(2);
    expect(screen.getByLabelText("Recepciones en tarjetas")).toHaveTextContent(
      "Pedido35Recibido10Pendiente25",
    );
  });
  it("offers a filter for missing deadlines instead of hiding them behind zero counts", () => {
    mocks.result.data = [
      unsent,
      { ...unsent, id: "order-2", order_number: "OC-2", pending_quantity: 0 },
    ];
    render(<DeliveryPanel />);
    fireEvent.change(screen.getByRole("combobox", { name: "Mostrar" }), {
      target: { value: "untracked" },
    });
    expect(screen.getAllByText("OC-1")).toHaveLength(2);
    expect(screen.queryByText("OC-2")).not.toBeInTheDocument();
  });
  it("does not present failed or loading queries as real zero counters", () => {
    mocks.result.isError = true;
    render(<DeliveryPanel />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByLabelText("Resumen de recepciones")).not.toBeInTheDocument();
  });
  it("opens the selected order without granting edit or send permissions", async () => {
    mocks.result.data = [unsent];
    mocks.single.mockResolvedValue({ data: unsent, error: null });
    render(<DeliveryPanel />);
    fireEvent.click(screen.getAllByRole("button", { name: "Revisar envío y plazo de OC-1" })[0]);
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toHaveTextContent("Editar: false · Enviar: false"),
    );
  });
});
