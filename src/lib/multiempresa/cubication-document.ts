import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type TenantDocumentLine = {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  stock: number | null;
  unitCost: number;
  isSpecial: boolean;
};

export type TenantDocumentContext = {
  client: string;
  unitType: string;
  reference: string;
};

export const moneyCLP = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency", currency: "CLP", maximumFractionDigits: 0,
  }).format(value);

export function summarizeTenantCubicationDocument(lines: readonly TenantDocumentLine[]) {
  if (lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0 ||
    !Number.isFinite(line.unitCost) || line.unitCost < 0)) {
    throw new Error("La cubicación contiene cantidades o costos inválidos.");
  }
  const groups = new Map<string, { category: string; subtotal: number; count: number }>();
  let total = 0;
  let missingPrices = 0;
  for (const line of lines) {
    const subtotal = line.quantity * line.unitCost;
    total += subtotal;
    if (line.unitCost === 0) missingPrices++;
    const category = line.category || "Sin categoría";
    const group = groups.get(category) ?? { category, subtotal: 0, count: 0 };
    group.subtotal += subtotal;
    group.count++;
    groups.set(category, group);
  }
  return { total, missingPrices, groups: [...groups.values()].sort((a, b) => a.category.localeCompare(b.category)) };
}

/** Exports already authorized company data; never queries another tenant or creates documents. */
export function downloadTenantCubicationPdf(
  unitCode: string,
  lines: readonly TenantDocumentLine[],
  context: TenantDocumentContext,
) {
  if (!unitCode || !lines.length) throw new Error("Selecciona un documento con materiales.");
  const summary = summarizeTenantCubicationDocument(lines);
  const pdf = new jsPDF();
  const date = new Date().toLocaleDateString("es-CL", { timeZone: "America/Santiago" });
  pdf.setFontSize(17);
  pdf.text("INTEGRASTOCK · Documento de cubicación", 14, 18);
  pdf.setFontSize(10);
  pdf.text(`Unidad de cubicaje: ${unitCode}`, 14, 28);
  if (context.unitType) pdf.text(`Tipo de unidad: ${context.unitType}`, 14, 35);
  if (context.client) pdf.text(`Cliente: ${context.client}`, 14, 42);
  if (context.reference) pdf.text(`Referencia: ${context.reference}`, 14, 49);
  pdf.text(`Fecha: ${date}`, 196, 28, { align: "right" });
  autoTable(pdf, {
    startY: 58,
    head: [["Material", "Categoría", "Stock", "Cantidad", "Costo unitario", "Subtotal"]],
    body: lines.map((line) => [
      line.name,
      line.category,
      line.isSpecial ? "Sin stock" : String(line.stock ?? "—"),
      `${line.quantity} ${line.unit}`,
      moneyCLP(line.unitCost),
      moneyCLP(line.quantity * line.unitCost),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [14, 70, 81] },
    didParseCell: (cell) => {
      if (cell.section === "body" && lines[cell.row.index]?.isSpecial) {
        cell.cell.styles.fillColor = [255, 247, 217];
      }
    },
  });
  const endY = (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 64;
  const summaryY = endY + 10;
  if (summaryY > 270) pdf.addPage();
  const y = summaryY > 270 ? 20 : summaryY;
  pdf.setFontSize(12);
  pdf.text(`Total materiales: ${moneyCLP(summary.total)}`, 14, y);
  if (summary.missingPrices) {
    pdf.setFontSize(9);
    pdf.text(`Atención: ${summary.missingPrices} material(es) sin costo registrado.`, 14, y + 7);
  }
  pdf.setFontSize(8);
  pdf.text("Documento de consulta: no genera compras ni descuenta inventario.", 14, Math.min(y + 16, 286));
  pdf.save(`cub icacion-${unitCode.replace(/[^a-z0-9-]/gi, "-")}.pdf`.replace("cub icacion", "cubicacion"));
}
