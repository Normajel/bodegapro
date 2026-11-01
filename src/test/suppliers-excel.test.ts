import { describe, expect, it } from "vitest";
import {
  createSuppliersWorkbook,
  readSuppliersWorkbook,
  SUPPLIER_COLUMNS,
  validateSupplierImport,
  type SupplierImportRow,
} from "@/lib/suppliers-excel";

function supplierRow(overrides: Partial<SupplierImportRow> = {}): SupplierImportRow {
  return {
    name: "Ferretería Central",
    rut: "",
    contact_name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    delivery_address: "",
    notes: "",
    supplier_type: "producto",
    delivery_lead_time_days: "",
    rowNumber: 2,
    ...overrides,
  };
}

describe("Validación de importación de proveedores", () => {
  it("acepta proveedores válidos y normaliza los campos", () => {
    const result = validateSupplierImport(
      [
        supplierRow({
          name: "  Ferretería   Central ",
          rut: "12.345.678-5",
          email: " ventas@test.cl ",
        }),
      ],
      [],
    );

    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      name: "Ferretería Central",
      rut: "12.345.678-5",
      email: "ventas@test.cl",
    });
  });

  it("rechaza RUT inválidos y correos mal formados", () => {
    const result = validateSupplierImport(
      [supplierRow({ rut: "12.345.678-0", email: "correo-invalido" })],
      [],
    );

    expect(result.errors).toContain('Fila 2: el RUT "12.345.678-0" no es válido.');
    expect(result.errors).toContain(
      'Fila 2: el correo "correo-invalido" no tiene un formato válido.',
    );
  });

  it("rechaza RUT duplicados existentes o repetidos en la planilla", () => {
    const result = validateSupplierImport(
      [
        supplierRow({ rut: "12.345.678-5", rowNumber: 2 }),
        supplierRow({ name: "Otro proveedor", rut: "12.345.678-5", rowNumber: 3 }),
      ],
      [{ name: "Proveedor existente", rut: "12.345.678-5" }],
    );

    expect(result.errors).toContain("Fila 2: ya existe un proveedor con el RUT 12.345.678-5.");
    expect(result.errors).toContain("Fila 3: el RUT 12.345.678-5 está repetido en la planilla.");
  });

  it("rechaza nombres repetidos sin RUT ignorando tildes y espacios", () => {
    const result = validateSupplierImport(
      [supplierRow({ rowNumber: 2 }), supplierRow({ name: "  FERRETERIA CENTRAL ", rowNumber: 3 })],
      [],
    );

    expect(result.errors).toContain(
      'Fila 3: el nombre "FERRETERIA CENTRAL" está repetido en la planilla.',
    );
  });

  it("requiere al menos una fila con proveedores", () => {
    expect(validateSupplierImport([], []).errors).toContain("La planilla no contiene proveedores.");
  });

  it("valida y conserva tipo y plazo de entrega", () => {
    const result = validateSupplierImport(
      [supplierRow({ supplier_type: "ambos", delivery_lead_time_days: "0" })],
      [],
    );

    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      supplier_type: "ambos",
      delivery_lead_time_days: 0,
    });
  });

  it("rechaza tipos desconocidos y plazos negativos o fraccionarios", () => {
    const result = validateSupplierImport(
      [
        supplierRow({ supplier_type: "otro", delivery_lead_time_days: "1.5" }),
        supplierRow({
          name: "Otro proveedor",
          supplier_type: "servicio",
          delivery_lead_time_days: "-1",
          rowNumber: 3,
        }),
      ],
      [],
    );

    expect(result.errors).toContain(
      "Fila 2: el tipo de proveedor debe ser producto, servicio o ambos.",
    );
    expect(result.errors).toContain(
      "Fila 2: el plazo de entrega debe ser un número entero mayor o igual a 0.",
    );
    expect(result.errors).toContain(
      "Fila 3: el plazo de entrega solo aplica a proveedores de producto o ambos.",
    );
  });

  it("importa las columnas nuevas y mantiene compatibilidad con la plantilla anterior", async () => {
    const { Workbook } = await import("exceljs");

    async function readWorkbook(headers: readonly string[], values: unknown[]) {
      const workbook = new Workbook();
      const sheet = workbook.addWorksheet("Proveedores");
      sheet.addRow([...headers]);
      sheet.addRow(values);
      const bytes = await workbook.xlsx.writeBuffer();
      const data = new Uint8Array(bytes);
      const file = {
        size: data.byteLength,
        arrayBuffer: async () =>
          data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      } as File;
      return readSuppliersWorkbook(file);
    }

    const imported = await readWorkbook(SUPPLIER_COLUMNS, [
      "Proveedor",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "ambos",
      12,
    ]);
    expect(imported[0]).toMatchObject({
      supplier_type: "ambos",
      delivery_lead_time_days: "12",
    });

    const legacy = await readWorkbook(SUPPLIER_COLUMNS.slice(0, 9), ["Proveedor"]);
    expect(legacy[0]).toMatchObject({
      supplier_type: "producto",
      delivery_lead_time_days: "",
    });

    const exported = await createSuppliersWorkbook([
      {
        name: "Proveedor",
        rut: "",
        contact_name: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        delivery_address: "",
        notes: "",
        supplier_type: "ambos",
        delivery_lead_time_days: 12,
      },
    ]);
    expect(exported.getWorksheet("Proveedores")?.getCell(2, 10).value).toBe("ambos");
    expect(exported.getWorksheet("Proveedores")?.getCell(2, 11).value).toBe(12);
  }, 60_000);
});
