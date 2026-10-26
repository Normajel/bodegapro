import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { CubicationGroup, CubicationParams } from "@/lib/cubication";
import { computeCosts } from "@/lib/cubication";

type CubicationPdfData = {
  unitTypeLabel?: string;
  unitCode: string;
  groups: CubicationGroup[];
  params: CubicationParams;
};

const clp = (value: number) =>
  `$ ${Math.round(value).toLocaleString("es-CL", { maximumFractionDigits: 0 })}`;

const qty = (value: number) => value.toLocaleString("es-CL", { maximumFractionDigits: 3 });

function buildCubicationPdf({ unitTypeLabel, unitCode, groups, params }: CubicationPdfData) {
  const doc = new jsPDF();
  const costs = computeCosts(groups, params);
  const today = new Date().toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Santiago",
  });

  doc.setFontSize(16);
  doc.text("Cubicación", 14, 18);
  doc.setFontSize(10);
  if (unitTypeLabel) doc.text(`Tipo de unidad: ${unitTypeLabel}`, 14, 26);
  doc.text(`Unidad de cubicaje: ${unitCode}`, 14, 32);
  doc.text(`Fecha: ${today}`, 196, 18, { align: "right" });

  const body: (string | { content: string; colSpan?: number; styles?: object })[][] = [];
  for (const group of groups) {
    body.push([
      {
        content: group.category,
        colSpan: 4,
        styles: { fontStyle: "bold", fillColor: [235, 235, 235] },
      },
    ]);
    for (const line of group.lines) {
      body.push([
        line.product.name,
        `${qty(line.quantity)} ${line.product.unit}`,
        clp(line.product.unit_cost),
        clp(line.subtotal),
      ]);
    }
    body.push([
      {
        content: `Subtotal ${group.category}`,
        colSpan: 3,
        styles: { halign: "right", fontStyle: "bold" },
      },
      { content: clp(group.subtotal), styles: { fontStyle: "bold" } },
    ]);
  }

  autoTable(doc, {
    startY: 38,
    head: [["Descripción", "Cantidad", "Costo unitario", "Subtotal"]],
    body,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [40, 52, 80] },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
  });

  const lastY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  autoTable(doc, {
    startY: (lastY ?? 38) + 8,
    theme: "grid",
    styles: { fontSize: 10 },
    body: [
      ["TOTAL MATERIALES", clp(costs.materials)],
      [`Otros costos`, clp(params.otherCosts)],
      ["COSTO DE FABRICACIÓN", clp(costs.fabrication)],
      [`COSTO ADMINISTRATIVO (${qty(params.adminPct)}%)`, clp(costs.administrative)],
      [
        { content: "COSTO TOTAL", styles: { fontStyle: "bold" } },
        { content: clp(costs.total), styles: { fontStyle: "bold" } },
      ],
      [
        {
          content: `VENTA PÚBLICO (${qty(params.retailMarginPct)}% margen)`,
          styles: { fontStyle: "bold", fillColor: [253, 230, 190] },
        },
        {
          content: clp(costs.retailPrice),
          styles: { fontStyle: "bold", fillColor: [253, 230, 190] },
        },
      ],
      [
        {
          content: `VENTA DISTRIBUIDOR (${qty(params.distributorMarginPct)}% margen)`,
          styles: { fontStyle: "bold", fillColor: [253, 230, 190] },
        },
        {
          content: clp(costs.distributorPrice),
          styles: { fontStyle: "bold", fillColor: [253, 230, 190] },
        },
      ],
    ],
    columnStyles: { 1: { halign: "right" } },
    tableWidth: 110,
    margin: { left: 86 },
  });

  return doc;
}

const fileName = (data: CubicationPdfData) =>
  `cubicacion-${data.unitTypeLabel ?? "unidad"}-${data.unitCode}`.replace(/[^\w-]+/g, "_") + ".pdf";

export function downloadCubicationPdf(data: CubicationPdfData) {
  buildCubicationPdf(data).save(fileName(data));
}

export function printCubicationPdf(data: CubicationPdfData) {
  const doc = buildCubicationPdf(data);
  doc.autoPrint();
  const url = URL.createObjectURL(doc.output("blob"));
  const win = window.open(url, "_blank");
  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error(
      "El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes.",
    );
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
