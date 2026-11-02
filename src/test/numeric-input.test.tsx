import { useState, createRef } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NumericInput } from "@/components/numeric-input";

afterEach(cleanup);
function NumericForm() {
  // Reproduce el patrón existente en compras, movimientos e inventario.
  const [value, setValue] = useState(0);
  return (
    <>
      <NumericInput
        aria-label="Costo"
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        required
        min={0}
        step="0.01"
      />
      <output aria-label="Número para guardar">{value}</output>
    </>
  );
}
describe("Edición de valores numéricos", () => {
  it("permite escribir, borrar completamente y reemplazar sin recuperar el cero", () => {
    render(<NumericForm />);
    const input = screen.getByRole("spinbutton", { name: "Costo" });
    expect(input).toHaveDisplayValue("");
    fireEvent.change(input, { target: { value: "2500" } });
    expect(input).toHaveDisplayValue("2500");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(input).toHaveDisplayValue("");
    expect(screen.getByLabelText("Número para guardar")).toHaveTextContent("0");
    fireEvent.change(input, { target: { value: "75" } });
    expect(input).toHaveDisplayValue("75");
  });
  it("conserva un cero ingresado explícitamente y valida los campos obligatorios", () => {
    render(<NumericForm />);
    const input = screen.getByRole("spinbutton");
    expect(input).toBeInvalid();
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    expect(input).toHaveDisplayValue("0");
    expect(input).toBeValid();
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toBeInvalid();
  });
  it("recibe valores externos y conserva las restricciones de cantidad", () => {
    const { rerender } = render(
      <NumericInput aria-label="Cantidad" value={4} min={1} step={1} onChange={() => {}} />,
    );
    expect(screen.getByRole("spinbutton")).toHaveValue(4);
    rerender(<NumericInput aria-label="Cantidad" value={7} min={1} step={1} onChange={() => {}} />);
    expect(screen.getByRole("spinbutton")).toHaveValue(7);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "0" } });
    expect(screen.getByRole("spinbutton")).toBeInvalid();
    rerender(<NumericInput aria-label="Cantidad" value={0} min={1} step={1} onChange={() => {}} />);
    expect(screen.getByRole("spinbutton")).toHaveDisplayValue("");
  });
  it("mantiene decimales permitidos, teclado y referencia al input", () => {
    const ref = createRef<HTMLInputElement>();
    render(<NumericInput ref={ref} aria-label="Precio" defaultValue="1.25" min={0} step="0.01" />);
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveValue(1.25);
    expect(input).toHaveAttribute("inputmode", "decimal");
    expect(ref.current).toBe(input);
    fireEvent.change(input, { target: { value: "2.50" } });
    expect(input).toHaveDisplayValue("2.50");
  });
  it("muestra el cero real en valores bloqueados o de solo lectura", () => {
    const { rerender } = render(<NumericInput aria-label="Valor" value={0} readOnly />);
    expect(screen.getByRole("spinbutton")).toHaveValue(0);
    rerender(<NumericInput aria-label="Valor" value={0} disabled />);
    expect(screen.getByRole("spinbutton")).toHaveValue(0);
  });
});
