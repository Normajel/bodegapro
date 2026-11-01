import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { RoleNotifications } from "@/components/role-notifications";
const mocks = vi.hoisted(() => ({
  warning: vi.fn(),
  result: {
    data: { approvals_pending: true, receipts_pending: true, low_stock: true },
    isLoading: false,
    isError: false,
  },
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => mocks.result }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("sonner", () => ({ toast: { warning: mocks.warning } }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.result.data = { approvals_pending: true, receipts_pending: true, low_stock: true };
  mocks.result.isError = false;
});
describe("notification bell and popup", () => {
  it("shows the correct bell count and does not repeat unchanged notices", () => {
    const { rerender } = render(
      <RoleNotifications access={{ name: "GERENCIA", permissions: {} }} />,
    );
    expect(
      screen.getByRole("button", { name: "Notificaciones: 2 avisos activos" }),
    ).toBeInTheDocument();
    expect(mocks.warning).toHaveBeenCalledTimes(2);
    mocks.result.data = { ...mocks.result.data };
    rerender(<RoleNotifications access={{ name: "GERENCIA", permissions: {} }} />);
    expect(mocks.warning).toHaveBeenCalledTimes(2);
  });
  it("notifies again when a resolved condition becomes pending again", () => {
    const { rerender } = render(<RoleNotifications access={{ name: "ADMIN", permissions: {} }} />);
    mocks.result.data = { approvals_pending: false, receipts_pending: false, low_stock: false };
    rerender(<RoleNotifications access={{ name: "ADMIN", permissions: {} }} />);
    expect(
      screen.getByRole("button", { name: "Notificaciones: 0 avisos activos" }),
    ).toBeInTheDocument();
    mocks.result.data = { approvals_pending: false, receipts_pending: true, low_stock: false };
    rerender(<RoleNotifications access={{ name: "ADMIN", permissions: {} }} />);
    expect(mocks.warning).toHaveBeenCalledTimes(3);
  });
  it("does not show the bell or popup to Bodega", () => {
    render(<RoleNotifications access={{ name: "BODEGA", permissions: {} }} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(mocks.warning).not.toHaveBeenCalled();
  });
  it("does not report cached data as current when the query fails", () => {
    mocks.result.isError = true;
    render(<RoleNotifications access={{ name: "ADMIN", permissions: {} }} />);
    expect(
      screen.getByRole("button", { name: "Notificaciones no disponibles" }),
    ).toBeInTheDocument();
    expect(mocks.warning).not.toHaveBeenCalled();
  });
});
