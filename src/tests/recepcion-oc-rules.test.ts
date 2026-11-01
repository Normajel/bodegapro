import { describe, expect, it } from "vitest";

// Simulación de reglas de negocio; no usa credenciales ni escribe en Supabase.
type Role = "BODEGA" | "GERENCIA" | "ADMIN" | "ADMINPRO";
type Order = { approved: boolean; status: "pendiente" | "parcial" | "completa" | "anulada"; ordered: number; received: number; stock: number; movements: number[] };

function receive(order: Order, role: Role, amount: number): Order {
  if (!["BODEGA", "ADMIN", "ADMINPRO"].includes(role)) throw Error("Perfil sin permiso");
  if (!order.approved || ["completa", "anulada"].includes(order.status)) throw Error("OC no disponible");
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > order.ordered - order.received) throw Error("Cantidad inválida");
  const received = order.received + amount;
  return { ...order, received, stock: order.stock + amount, movements: [...order.movements, amount], status: received === order.ordered ? "completa" : "parcial" };
}
const initial = (): Order => ({ approved: true, status: "pendiente", ordered: 10, received: 0, stock: 50, movements: [] });

describe("reglas de recepción de OC — simulación sin base de datos", () => {
  it("registra recepción parcial y luego completa sin duplicar stock", () => {
    const partial = receive(initial(), "BODEGA", 4);
    expect(partial).toEqual({ approved: true, status: "parcial", ordered: 10, received: 4, stock: 54, movements: [4] });
    const complete = receive(partial, "BODEGA", 6);
    expect(complete).toMatchObject({ status: "completa", received: 10, stock: 60, movements: [4, 6] });
    expect(() => receive(complete, "BODEGA", 1)).toThrow("OC no disponible");
  });
  it.each(["ADMIN", "ADMINPRO"] as Role[])("%s puede recibir", (role) => {
    expect(receive(initial(), role, 1).received).toBe(1);
  });
  it("GERENCIA no recibe", () => {
    expect(() => receive(initial(), "GERENCIA", 1)).toThrow("Perfil sin permiso");
  });
  it.each([-1, 0, 1.5, 11, Number.NaN, Number.POSITIVE_INFINITY])("rechaza cantidad inválida %s", (amount) => {
    expect(() => receive(initial(), "BODEGA", amount)).toThrow("Cantidad inválida");
  });
  it("rechaza OC no aprobada o anulada", () => {
    expect(() => receive({ ...initial(), approved: false }, "BODEGA", 1)).toThrow();
    expect(() => receive({ ...initial(), status: "anulada" }, "BODEGA", 1)).toThrow();
  });
  it("no altera el objeto original", () => {
    const original = initial();
    receive(original, "BODEGA", 3);
    expect(original).toEqual(initial());
  });
});
