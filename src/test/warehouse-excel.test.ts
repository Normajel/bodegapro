import { describe, expect, it } from "vitest";
import { validateInventoryImport, type InventoryImportRow } from "@/lib/warehouse-excel";

function importRow(overrides: Partial<InventoryImportRow> = {}): InventoryImportRow {
  return {
    sku: null,
    name: "Pintura blanca",
    category: "PINTURA",
    stock_quantity: 2,
    min_stock: 1,
    unit_cost: 1200,
    rowNumber: 2,
    ...overrides,
  };
}

describe("Validación de importación de inventario", () => {
  it("acepta SKU vacío para crear productos con SKU automático", () => {
    const result = validateInventoryImport([importRow()], []);

    expect(result.errors).toEqual([]);
    expect(result.newCount).toBe(1);
    expect(result.rows[0]?.sku).toBeNull();
  });

  it("rechaza descripciones repetidas ignorando mayúsculas, tildes y espacios", () => {
    const result = validateInventoryImport(
      [
        importRow({ rowNumber: 2 }),
        importRow({ name: "  PINTURA   BLANCA ", category: "Pintúra", rowNumber: 3 }),
      ],
      [],
    );

    expect(result.errors).toContain(
      'Fila 3: "  PINTURA   BLANCA " de la categoría "Pintúra" está repetido en la planilla.',
    );
  });

  it("rechaza SKUs duplicados en el archivo", () => {
    const result = validateInventoryImport(
      [importRow({ sku: "PINT001" }), importRow({ sku: "pint001", name: "Pintura azul" })],
      [],
    );

    expect(result.errors.some((error) => error.includes("SKU") && error.includes("repetido"))).toBe(
      true,
    );
  });

  it("identifica productos existentes por SKU y preserva su SKU canónico", () => {
    const result = validateInventoryImport(
      [importRow({ sku: "pint001" })],
      [
        {
          id: "product-1",
          sku: "PINT001",
          name: "Pintura blanca",
          category: "PINTURA",
        },
      ],
    );

    expect(result.errors).toEqual([]);
    expect(result.updateCount).toBe(1);
    expect(result.newCount).toBe(0);
    expect(result.rows[0]?.sku).toBe("PINT001");
  });

  it("rechaza productos que ya existen con otro SKU", () => {
    const result = validateInventoryImport(
      [importRow({ sku: null })],
      [
        {
          id: "product-1",
          sku: "PINT001",
          name: "Pintura blanca",
          category: "PINTURA",
        },
      ],
    );

    expect(result.errors.some((error) => error.includes("ya existe con SKU PINT001"))).toBe(true);
  });
});
