import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { SpecialProductSelector } from "@/components/special-product-selector";
import { AppAccessContext } from "@/lib/permissions";
import { CubicationWindow } from "@/components/cubication-window";
import { SpecialProductParameterSelect } from "@/components/special-product-parameter-select";
import type { SpecialProduct } from "@/lib/special-products";
const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  single: vi.fn(),
  rpc: vi.fn(),
  download: vi.fn(),
  error: vi.fn(),
  parameterUpdate: vi.fn(),
  parameterSave: vi.fn(),
}));
const product: SpecialProduct = {
  id: "sp-id",
  sku: "ESP000123",
  name: "Puerta especial",
  category: "ESTRUCTURA",
  unit: "unidad",
  supplier_id: null,
  unit_cost: 2500,
  barcode: null,
  location: null,
  active: true,
  created_by: "user",
  created_at: "2026-11-02",
};
vi.mock("@/hooks/use-special-products", () => ({
  useSpecialProducts: () => ({
    data: [product],
    isPending: false,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/lib/cubication-pdf", () => ({
  downloadCubicationPdf: mocks.download,
  printCubicationPdf: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: mocks.error } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: (table: string) => {
      if (table === "special_products")
        return {
          insert: (payload: unknown) => {
            mocks.insert(payload);
            return { select: () => ({ single: mocks.single }) };
          },
        };
      if (table === "special_product_parameters")
        return {
          update: (payload: unknown) => {
            mocks.parameterUpdate(payload);
            return { eq: () => ({ select: () => ({ single: mocks.parameterSave }) }) };
          },
          select: () => ({
            order: async () => ({
              data: [
                { id: "param-category", kind: "category", label: "ESTRUCTURA", active: true },
                { id: "param-unit", kind: "unit", label: "unidad", active: true },
              ],
              error: null,
            }),
          }),
        };
      if (table === "supplier_directory")
        return { select: () => ({ order: async () => ({ data: [], error: null }) }) };
      if (table === "products")
        return {
          select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
        };
      if (table === "cubication_templates")
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "template-id", unit_code: "UNIT", cubication_template_items: [] },
                error: null,
              }),
            }),
          }),
        };
      if (table === "cubication_special_items")
        return {
          select: () => ({
            eq: async () => ({
              data: [
                {
                  template_id: "template-id",
                  line_id: "line-id",
                  special_product_id: "sp-id",
                  quantity: 2,
                  unit_cost: 2500,
                },
              ],
              error: null,
            }),
          }),
        };
      throw new Error("Unexpected table " + table);
    },
  },
}));
function wrap(children: React.ReactNode, role = "VENTA") {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AppAccessContext.Provider
        value={{
          name: role,
          permissions: {
            special_inventory: { view: true, create: true },
            cubication: { view: true, edit: true },
          },
        }}
      >
        {children}
      </AppAccessContext.Provider>
    </QueryClientProvider>
  );
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function Fixture() {
  const [value, setValue] = useState("");
  return (
    <>
      <input aria-label="Cliente planilla" defaultValue="Cliente conservado" />
      <SpecialProductSelector value={value} onSelect={(p) => setValue(p.id)} />
    </>
  );
}
describe("Productos especiales", () => {
  it("muestra listas desplegables y oculta la administración para Ventas", async () => {
    render(wrap(<Fixture />));
    fireEvent.click(screen.getByRole("button", { name: "Nuevo producto especial" }));
    expect(screen.getByRole("combobox", { name: "Categoría *" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Unidad de medida *" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Administrar/ })).not.toBeInTheDocument();
  });
  it("permite a Admin modificar una opción compartida y selecciona el nuevo valor", async () => {
    mocks.parameterSave.mockResolvedValue({
      data: { id: "param-category", kind: "category", label: "CATEGORÍA NUEVA", active: true },
      error: null,
    });
    const select = vi.fn();
    render(
      wrap(
        <SpecialProductParameterSelect kind="category" value="ESTRUCTURA" onChange={select} />,
        "ADMIN",
      ),
    );
    const manage = screen.getByRole("button", { name: "Administrar categoría" });
    await waitFor(() => expect(manage).toBeEnabled());
    fireEvent.click(manage);
    fireEvent.change(screen.getByLabelText("Nombre de categoría"), {
      target: { value: "CATEGORÍA NUEVA" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambio" }));
    await waitFor(() => expect(select).toHaveBeenCalledWith("CATEGORÍA NUEVA"));
    expect(mocks.parameterUpdate).toHaveBeenCalledWith({ label: "CATEGORÍA NUEVA" });
  });
  it("filtra descripción y SKU y permite seleccionar con teclado", () => {
    render(wrap(<Fixture />));
    const combo = screen.getByRole("combobox");
    fireEvent.focus(combo);
    fireEvent.change(combo, { target: { value: "ESP000123" } });
    expect(screen.getByRole("option")).toHaveTextContent("Puerta especial");
    fireEvent.keyDown(combo, { key: "Enter" });
    expect(combo).toHaveValue("Puerta especial");
  });
  it("guarda inmediatamente, selecciona el producto y reinicia solo el modal", async () => {
    mocks.single.mockResolvedValue({ data: product, error: null });
    render(wrap(<Fixture />));
    fireEvent.click(screen.getByRole("button", { name: "Nuevo producto especial" }));
    fireEvent.change(screen.getByLabelText("Descripción *"), {
      target: { value: "Puerta especial" },
    });
    fireEvent.change(screen.getByLabelText("Costo unitario de referencia (CLP)"), {
      target: { value: "2500" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar producto especial" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Puerta especial", supplier_id: null }),
    );
    expect(mocks.insert.mock.calls[0]?.[0]).not.toHaveProperty("sku");
    expect(mocks.insert.mock.calls[0]?.[0]).not.toHaveProperty("stock");
    expect(screen.getByRole("combobox")).toHaveValue("Puerta especial");
    fireEvent.click(screen.getByRole("button", { name: "Nuevo producto especial" }));
    expect(screen.getByLabelText("Descripción *")).toHaveValue("");
    expect(screen.getByLabelText("Cliente planilla")).toHaveValue("Cliente conservado");
  });
  it("vacía el formulario al cancelar incluso si se abrió desde una búsqueda", () => {
    render(wrap(<Fixture />));
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Producto que no existe" } });
    fireEvent.click(screen.getByRole("button", { name: "Nuevo producto especial" }));
    expect(screen.getByLabelText("Descripción *")).toHaveValue("Producto que no existe");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Nuevo producto especial" }));
    expect(screen.getByLabelText("Descripción *")).toHaveValue("");
    expect(screen.getByLabelText("Cliente planilla")).toHaveValue("Cliente conservado");
  });
  it("mantiene los datos y permite reintentar cuando falla el guardado", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { message: "Error de conexión" } });
    render(wrap(<Fixture />));
    fireEvent.click(screen.getByRole("button", { name: "Nuevo producto especial" }));
    fireEvent.change(screen.getByLabelText("Descripción *"), {
      target: { value: "Producto pendiente" },
    });
    fireEvent.change(screen.getByLabelText("Costo unitario de referencia (CLP)"), {
      target: { value: "2500" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar producto especial" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Error de conexión"));
    expect(screen.getByLabelText("Descripción *")).toHaveValue("Producto pendiente");
  });
  it("repite PDF y guardar con el mismo documento sin borrar la configuración", async () => {
    mocks.rpc.mockResolvedValue({ data: "doc-id", error: null });
    render(wrap(<CubicationWindow unitCode="UNIT" onClose={vi.fn()} />));
    await screen.findByRole("button", { name: "PDF" });
    const client = screen.getByPlaceholderText("Nombre del cliente");
    fireEvent.change(client, { target: { value: "Cliente prueba" } });
    const type = screen.getByText("Tipo de unidad").closest("label")!.querySelector("select")!;
    fireEvent.change(type, { target: { value: type.options[1]!.value } });
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Guardar plantilla" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(3));
    const payloads = mocks.rpc.mock.calls.map((call) => call[1]);
    expect(new Set(payloads.map((p) => p.p_document_id)).size).toBe(1);
    expect(payloads[0].p_lines).toEqual([
      { line_id: "line-id", special_product_id: "sp-id", quantity: 2, unit_cost: 2500 },
    ]);
    expect(client).toHaveValue("Cliente prueba");
    expect(type).not.toHaveValue("");
  });
});
