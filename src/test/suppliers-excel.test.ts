import { describe, expect, it } from "vitest";
import { validateSupplierImport, type SupplierImportRow } from "@/lib/suppliers-excel";

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
});
