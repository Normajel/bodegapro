import { cleanRut, formatRut, isValidRut } from "@/lib/rut";

export const SUPPLIER_COLUMNS = [
  "Nombre / Razón social *",
  "RUT",
  "Persona de contacto",
  "Correo",
  "Teléfono",
  "Dirección",
  "Ciudad",
  "Dirección de despacho",
  "Notas",
] as const;

const MAX_SUPPLIER_IMPORT_ROWS = 1000;

export type SupplierImportRow = {
  name: string;
  rut: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  delivery_address: string;
  notes: string;
  rowNumber: number;
};

export type ExistingSupplier = {
  name: string;
  rut: string | null;
};

export type SupplierImportValidation = {
  rows: SupplierImportRow[];
  errors: string[];
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function readCellText(value: unknown, column: string, rowNumber: number) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }

  if (typeof value === "object") {
    if ("formula" in value || "sharedFormula" in value) {
      throw new Error(`Fila ${rowNumber}: no se permiten fórmulas en la columna "${column}".`);
    }

    if ("text" in value && typeof value.text === "string") {
      return value.text.trim();
    }

    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) =>
          part && typeof part === "object" && "text" in part && typeof part.text === "string"
            ? part.text
            : "",
        )
        .join("")
        .trim();
    }
  }

  return String(value).trim();
}

export function validateSupplierImport(
  rows: SupplierImportRow[],
  existingSuppliers: ExistingSupplier[],
): SupplierImportValidation {
  const errors: string[] = [];
  const existingRuts = new Set(
    existingSuppliers.map((supplier) => cleanRut(supplier.rut ?? "")).filter(Boolean),
  );
  const existingNamesWithoutRut = new Set(
    existingSuppliers
      .filter((supplier) => !supplier.rut)
      .map((supplier) => normalizeText(supplier.name))
      .filter(Boolean),
  );
  const seenRuts = new Set<string>();
  const seenNamesWithoutRut = new Set<string>();

  if (rows.length === 0) {
    errors.push("La planilla no contiene proveedores.");
  }
  if (rows.length > MAX_SUPPLIER_IMPORT_ROWS) {
    errors.push(`La planilla supera el máximo de ${MAX_SUPPLIER_IMPORT_ROWS} proveedores.`);
  }

  const validatedRows = rows.map((row) => {
    const name = row.name.trim().replace(/\s+/g, " ");
    const rut = row.rut.trim();
    const email = row.email.trim();
    const normalizedRut = cleanRut(rut);
    const normalizedName = normalizeText(name);

    if (!name) {
      errors.push(`Fila ${row.rowNumber}: falta el nombre o razón social.`);
    }

    if (rut && !isValidRut(rut)) {
      errors.push(`Fila ${row.rowNumber}: el RUT "${rut}" no es válido.`);
    } else if (normalizedRut) {
      if (existingRuts.has(normalizedRut)) {
        errors.push(`Fila ${row.rowNumber}: ya existe un proveedor con el RUT ${formatRut(rut)}.`);
      }
      if (seenRuts.has(normalizedRut)) {
        errors.push(
          `Fila ${row.rowNumber}: el RUT ${formatRut(rut)} está repetido en la planilla.`,
        );
      }
      seenRuts.add(normalizedRut);
    } else if (normalizedName) {
      if (existingNamesWithoutRut.has(normalizedName)) {
        errors.push(
          `Fila ${row.rowNumber}: ya existe un proveedor sin RUT con el nombre "${name}".`,
        );
      }
      if (seenNamesWithoutRut.has(normalizedName)) {
        errors.push(`Fila ${row.rowNumber}: el nombre "${name}" está repetido en la planilla.`);
      }
      seenNamesWithoutRut.add(normalizedName);
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push(`Fila ${row.rowNumber}: el correo "${email}" no tiene un formato válido.`);
    }

    return {
      ...row,
      name,
      rut: normalizedRut && isValidRut(rut) ? formatRut(rut) : "",
      contact_name: row.contact_name.trim(),
      email,
      phone: row.phone.trim(),
      address: row.address.trim(),
      city: row.city.trim(),
      delivery_address: row.delivery_address.trim(),
      notes: row.notes.trim(),
    };
  });

  return { rows: validatedRows, errors };
}

export async function downloadSuppliersWorkbook() {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("Proveedores");

  workbook.creator = "BodegaPro";
  sheet.addRow([...SUPPLIER_COLUMNS]);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: "A1",
    to: { row: MAX_SUPPLIER_IMPORT_ROWS + 1, column: SUPPLIER_COLUMNS.length },
  };
  sheet.columns = [
    { width: 34 },
    { width: 18, style: { numFmt: "@" } },
    { width: 28 },
    { width: 32 },
    { width: 20, style: { numFmt: "@" } },
    { width: 34 },
    { width: 22 },
    { width: 34 },
    { width: 40 },
  ];

  const header = sheet.getRow(1);
  header.height = 30;
  header.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF263445" },
  };

  const instructions = workbook.addWorksheet("Instrucciones");
  instructions.columns = [{ width: 32 }, { width: 100 }];
  instructions.addRows([
    ["Campo", "Instrucción"],
    ["Nombre / Razón social *", "Obligatorio. Nombre comercial o razón social del proveedor."],
    ["RUT", "Opcional. Ingresa un RUT chileno válido; no repitas RUT existentes."],
    ["Persona de contacto", "Opcional."],
    ["Correo", "Opcional. Si se completa, debe tener formato de correo."],
    ["Teléfono", "Opcional. Se conserva como texto."],
    ["Dirección", "Opcional. Dirección comercial o principal."],
    ["Ciudad", "Opcional."],
    ["Dirección de despacho", "Opcional."],
    ["Notas", "Opcional."],
    [
      "Importación",
      "Completa una fila por proveedor y conserva los nombres y orden de las columnas.",
    ],
    ["Duplicados", "La carga agrega proveedores nuevos; no modifica registros existentes."],
  ]);
  const instructionHeader = instructions.getRow(1);
  instructionHeader.height = 26;
  instructionHeader.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  instructionHeader.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF263445" },
  };
  instructions.views = [{ state: "frozen", ySplit: 1 }];

  const bytes = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "plantilla-proveedores-bodegapro.xlsx";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readSuppliersWorkbook(file: File): Promise<SupplierImportRow[]> {
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("La planilla supera el máximo permitido de 10 MB.");
  }

  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("La planilla no contiene hojas.");
  }

  const headers = SUPPLIER_COLUMNS.map((_, index) =>
    readCellText(sheet.getCell(1, index + 1).value, SUPPLIER_COLUMNS[index]!, 1),
  );
  if (SUPPLIER_COLUMNS.some((name, index) => headers[index] !== name)) {
    throw new Error(
      "Usa la plantilla de proveedores de BodegaPro y conserva el orden de sus columnas.",
    );
  }

  const rows: SupplierImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const values = SUPPLIER_COLUMNS.map((column, index) =>
      readCellText(row.getCell(index + 1).value, column, rowNumber),
    );
    if (values.every((value) => !value)) return;
    if (rows.length >= MAX_SUPPLIER_IMPORT_ROWS) {
      throw new Error(`La planilla supera el máximo de ${MAX_SUPPLIER_IMPORT_ROWS} proveedores.`);
    }

    rows.push({
      name: values[0]!,
      rut: values[1]!,
      contact_name: values[2]!,
      email: values[3]!,
      phone: values[4]!,
      address: values[5]!,
      city: values[6]!,
      delivery_address: values[7]!,
      notes: values[8]!,
      rowNumber,
    });
  });

  return rows;
}
