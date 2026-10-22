export const INVENTORY_COLUMNS = [
  "SKU",
  "Descripción",
  "Categoría",
  "Stock",
  "Stock crítico",
  "Costo unitario",
  "Costo total",
  "Gestión",
] as const;

export type InventoryImportRow = {
  sku: string | null;
  name: string;
  category: string;
  stock_quantity: number;
  min_stock: number;
  unit_cost: number;
  rowNumber: number;
};

type InventoryWorkbookRow = Omit<InventoryImportRow, "rowNumber" | "sku"> & {
  sku: string;
};

type ExistingInventoryProduct = {
  id: string;
  sku: string;
  name: string;
  category: string;
};

export type InventoryImportValidation = {
  rows: InventoryImportRow[];
  errors: string[];
  newCount: number;
  updateCount: number;
};

function normalizeInventoryValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function inventoryItemKey(name: string, category: string) {
  return `${normalizeInventoryValue(category)}\u0000${normalizeInventoryValue(name)}`;
}

export function validateInventoryImport(
  rows: InventoryImportRow[],
  existingProducts: ExistingInventoryProduct[],
): InventoryImportValidation {
  const errors: string[] = [];
  const seenSkus = new Set<string>();
  const seenItems = new Set<string>();
  const existingBySku = new Map(
    existingProducts.map((product) => [normalizeInventoryValue(product.sku), product]),
  );
  const existingByItem = new Map(
    existingProducts.map((product) => [inventoryItemKey(product.name, product.category), product]),
  );

  const validatedRows = rows.map((row) => {
    const normalizedSku = row.sku ? normalizeInventoryValue(row.sku) : "";
    const matchingProduct = normalizedSku ? existingBySku.get(normalizedSku) : undefined;
    const itemKey = inventoryItemKey(row.name, row.category);
    const previousSkuRow = normalizedSku ? seenSkus.has(normalizedSku) : false;
    const previousItemRow = seenItems.has(itemKey);

    if (previousSkuRow) {
      errors.push(`Fila ${row.rowNumber}: SKU "${row.sku}" repetido en la planilla.`);
    } else if (normalizedSku) {
      seenSkus.add(normalizedSku);
    }

    if (previousItemRow) {
      errors.push(
        `Fila ${row.rowNumber}: "${row.name}" de la categoría "${row.category}" está repetido en la planilla.`,
      );
    } else {
      seenItems.add(itemKey);
    }

    const existingItem = existingByItem.get(itemKey);
    if (existingItem && existingItem.id !== matchingProduct?.id) {
      errors.push(
        `Fila ${row.rowNumber}: "${row.name}" ya existe con SKU ${existingItem.sku} en la categoría "${existingItem.category}".`,
      );
    }

    return {
      ...row,
      sku: matchingProduct?.sku ?? row.sku,
    };
  });

  return {
    rows: validatedRows,
    errors,
    newCount: validatedRows.filter(
      (row) => !row.sku || !existingBySku.has(normalizeInventoryValue(row.sku)),
    ).length,
    updateCount: validatedRows.filter(
      (row) => row.sku && existingBySku.has(normalizeInventoryValue(row.sku)),
    ).length,
  };
}

const MAX_IMPORT_ROWS = 5000;
const MAX_WORKSHEET_ROW = MAX_IMPORT_ROWS + 1;
const WORKSHEET_COLUMNS = INVENTORY_COLUMNS.length;

export async function downloadInventoryWorkbook(rows: InventoryWorkbookRow[]) {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("Inventario");

  workbook.creator = "BodegaPro";
  sheet.addRow([...INVENTORY_COLUMNS]);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: "A1",
    to: { row: Math.max(1, rows.length + 1), column: WORKSHEET_COLUMNS },
  };
  sheet.columns = [
    { width: 20, style: { numFmt: "@" } },
    { width: 32 },
    { width: 24 },
    { width: 16, style: { numFmt: "#,##0.##" } },
    { width: 16, style: { numFmt: "#,##0.##" } },
    { width: 20, style: { numFmt: '"$"#,##0.##' } },
    { width: 20, style: { numFmt: '"$"#,##0.##' } },
    { width: 18 },
  ];

  const header = sheet.getRow(1);
  header.height = 30;
  header.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF263445" },
  };

  rows.forEach((product, index) => {
    const rowNumber = index + 2;
    sheet.addRow([
      product.sku,
      product.name,
      product.category,
      product.stock_quantity,
      product.min_stock,
      product.unit_cost,
    ]);
    sheet.getCell(rowNumber, 7).value = {
      formula: `D${rowNumber}*F${rowNumber}`,
    };
    sheet.getCell(rowNumber, 8).value = {
      formula: `IF(D${rowNumber}<=E${rowNumber},"COMPRAR","OK")`,
    };
    sheet.getRow(rowNumber).height = 22;
  });

  for (let row = 2; row <= MAX_WORKSHEET_ROW; row++) {
    for (const column of [4, 5, 6]) {
      sheet.getCell(row, column).dataValidation = {
        type: "decimal",
        operator: "greaterThanOrEqual",
        allowBlank: true,
        formulae: [0],
        showErrorMessage: true,
        error: "Ingresa un número igual o mayor a cero",
      };
    }
  }

  sheet.addConditionalFormatting({
    ref: `D2:D${MAX_WORKSHEET_ROW}`,
    rules: [
      {
        type: "expression",
        priority: 1,
        formulae: ["D2<$E2"],
        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFDADA" } } },
      },
      {
        type: "expression",
        priority: 2,
        formulae: ["D2=$E2"],
        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFEDB5" } } },
      },
      {
        type: "expression",
        priority: 3,
        formulae: ["D2>$E2"],
        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFD8F3E3" } } },
      },
    ],
  });

  const bytes = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "inventario-bodegapro.xlsx";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readRequiredText(value: unknown, field: string, rowNumber: number) {
  const text = value == null ? "" : String(value).trim();
  if (!text) {
    throw new Error(`Fila ${rowNumber}: falta ${field}.`);
  }
  return text;
}

function readNonNegativeNumber(value: unknown, field: string, rowNumber: number) {
  const text = value == null ? "" : String(value).trim();
  const number = typeof value === "number" ? value : Number(text.replace(",", "."));
  if (!text || !Number.isFinite(number) || number < 0) {
    throw new Error(`Fila ${rowNumber}: "${field}" debe ser un número igual o mayor a cero.`);
  }
  return number;
}

export async function readInventoryWorkbook(file: File): Promise<InventoryImportRow[]> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("La planilla no contiene hojas.");
  }

  const headers = INVENTORY_COLUMNS.map((_, index) =>
    String(sheet.getCell(1, index + 1).value ?? "").trim(),
  );
  if (INVENTORY_COLUMNS.some((name, index) => headers[index] !== name)) {
    throw new Error(
      "Usa la plantilla de inventario de BodegaPro y conserva el orden de sus columnas.",
    );
  }

  const rows: InventoryImportRow[] = [];
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    const values = Array.from({ length: 6 }, (_, column) => row.getCell(column + 1).value);
    if (values.every((value) => value == null || String(value).trim() === "")) return;
    if (rows.length >= MAX_IMPORT_ROWS) {
      throw new Error(`La planilla supera el máximo de ${MAX_IMPORT_ROWS} productos.`);
    }

    const skuText = values[0] == null ? "" : String(values[0]).trim();

    rows.push({
      sku: skuText || null,
      name: readRequiredText(values[1], "Descripción", index),
      category: readRequiredText(values[2], "Categoría", index),
      stock_quantity: readNonNegativeNumber(values[3], "Stock", index),
      min_stock: readNonNegativeNumber(values[4], "Stock crítico", index),
      unit_cost: readNonNegativeNumber(values[5], "Costo unitario", index),
      rowNumber: index,
    });
  });

  if (rows.length === 0) {
    throw new Error("La planilla no contiene productos para importar.");
  }

  return rows;
}
