import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";
import { RoleNotifications } from "@/components/role-notifications";
const mocks = vi.hoisted(() => ({
  warning: vi.fn(),
  dismiss: vi.fn(),
  result: {
    data: { approvals_pending: true, receipts_pending: true, low_stock: true },
    isLoading: false,
    isError: false,
  },
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => mocks.result }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("sonner", () => ({ toast: { warning: mocks.warning, dismiss: mocks.dismiss } }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  mocks.result.data = { approvals_pending: true, receipts_pending: true, low_stock: true };
  mocks.result.isError = false;
});
describe("notification bell and popup", () => {
  it("shows the correct bell count and does not repeat unchanged notices", () => {
    const { rerender } = render(
      <RoleNotifications access={{ name: "GERENCIA", permissions: {} }} />,
    );
    expect(screen.getByRole("button", { name: "Notificaciones: 2 sin leer" })).toBeInTheDocument();
    expect(mocks.warning).toHaveBeenCalledTimes(2);
    mocks.result.data = { ...mocks.result.data };
    rerender(<RoleNotifications access={{ name: "GERENCIA", permissions: {} }} />);
    expect(mocks.warning).toHaveBeenCalledTimes(2);
  });
  it("notifies again when a resolved condition becomes pending again", () => {
    const { rerender } = render(<RoleNotifications access={{ name: "ADMIN", permissions: {} }} />);
    mocks.result.data = { approvals_pending: false, receipts_pending: false, low_stock: false };
    rerender(<RoleNotifications access={{ name: "ADMIN", permissions: {} }} />);
    expect(screen.getByRole("button", { name: "Notificaciones: 0 sin leer" })).toBeInTheDocument();
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

it("opens the bell and displays the admin notices", () => {
  render(<RoleNotifications access={{ name: "ADMIN", permissions: {} }} />);
  fireEvent.click(screen.getByRole("button", { name: "Notificaciones: 2 sin leer" }));
  expect(screen.getByText("Hay productos no recepcionados.")).toBeVisible();
  expect(screen.getByText("Hay productos bajo stock.")).toBeVisible();
});

it("dismisses a yellow notice by tapping it and decrements the unread badge", () => {
  render(<RoleNotifications access={{ name: "ADMIN", permissions: {}, userId: "admin-test" }} />);
  const yellow = mocks.warning.mock.calls[0]![0];
  const popup = render(yellow);
  fireEvent.click(
    screen.getByRole("button", { name: /Cerrar aviso: Hay productos no recepcionados/ }),
  );
  expect(screen.getByRole("button", { name: "Notificaciones: 1 sin leer" })).toBeInTheDocument();
  expect(mocks.dismiss).toHaveBeenCalled();
  popup.unmount();
});
it("updates the badge after reading all and preserves that user's read state", () => {
  const props = { name: "ADMIN", permissions: {}, userId: "admin-persist" };
  const view = render(<RoleNotifications access={props} />);
  fireEvent.click(screen.getByRole("button", { name: "Notificaciones: 2 sin leer" }));
  fireEvent.click(screen.getByRole("button", { name: "Marcar todas como leídas" }));
  expect(screen.getByRole("button", { name: "Notificaciones: 0 sin leer" })).toBeInTheDocument();
  expect(screen.queryByText("Hay productos bajo stock.")).not.toBeInTheDocument();
  view.unmount();
  render(<RoleNotifications access={props} />);
  expect(screen.getByRole("button", { name: "Notificaciones: 0 sin leer" })).toBeInTheDocument();
});
it("acknowledges a swipe dismissal and keeps the other user's notices unread", () => {
  const { rerender } = render(
    <RoleNotifications access={{ name: "ADMIN", permissions: {}, userId: "user-a" }} />,
  );
  const onDismiss = mocks.warning.mock.calls[0]![1].onDismiss;
  // Sonner invokes onDismiss for a manual close or swipe.
  act(() => onDismiss());
  expect(screen.getByRole("button", { name: "Notificaciones: 1 sin leer" })).toBeInTheDocument();
  rerender(<RoleNotifications access={{ name: "ADMIN", permissions: {}, userId: "user-b" }} />);
  expect(screen.getByRole("button", { name: "Notificaciones: 2 sin leer" })).toBeInTheDocument();
});
