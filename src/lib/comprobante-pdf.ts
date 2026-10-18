
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type ComprobanteData = {
  folio: number | null;
  type: "entrada" | "salida";
  created_at: string;
  product_name: string;
  product_sku: string;
  unit: string;
  quantity: number;
  unit_type?: string | null;
  supplier?: string | null;
  master_name?: string | null;
  notes?: string | null;
};

export type CompraItemPDF = {
  product_name: string;
  product_sku: string;
  quantity: number;
  unit: string;
  unit_price: number;
};

export type ComprobanteCompraData = {
  id: string;
  created_at: string;
  supplier: string;
  purchase_order: string;
  document_type: "factura" | "guia_despacho";
  document_number: string;
  notes: string;
  items: CompraItemPDF[];
};

export const UNIT_TYPE_LABELS: Record<string, string> = {
  stock: "Stock",
  arriendo: "Arriendo",
  nota_venta: "Nota de venta",
};

export function folioLabel(type: string, folio: number | null | undefined) {
  if (!folio) return "—";
  return `${type === "entrada" ? "E" : "S"}-${String(folio).padStart(6, "0")}`;
}

export function generarComprobante(d: ComprobanteData) {
  const doc = new jsPDF();
  const titulo = d.type === "entrada" ? "Comprobante de Entrada" : "Comprobante de Salida";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("BodegaPro", 14, 20);
  doc.setFontSize(14);
  doc.text(titulo, 14, 30);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`N° ${folioLabel(d.type, d.folio)}`, 196, 20, { align: "right" });
  doc.text(
    new Date(d.created_at).toLocaleString("es-CL", {
      dateStyle: "short",
      timeStyle: "short",
    }),
    196,
    30,
    { align: "right" },
  );

  const rows: [string, string][] = [
    ["N° correlativo", folioLabel(d.type, d.folio)],
    ["Tipo de movimiento", d.type === "entrada" ? "Entrada" : "Salida"],
    ["Producto", d.product_name],
    ["SKU", d.product_sku],
    ["Cantidad", `${d.quantity} ${d.unit}`],
  ];

  if (d.type === "salida") {
    rows.push([
      "Tipo de unidad",
      d.unit_type ? UNIT_TYPE_LABELS[d.unit_type] ?? d.unit_type : "—",
    ]);
  } else {
    rows.push(["Proveedor", d.supplier || "—"]);
  }

  rows.push(["Nombre maestro", d.master_name || "—"]);
  rows.push(["Observaciones", d.notes || "—"]);

  autoTable(doc, {
    startY: 40,
    body: rows,
    theme: "grid",
    styles: { fontSize: 11, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 55, fillColor: [245, 245, 245] },
    },
  });

  const y =
    ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? 120) + 35;

  if (y < 270) {
    doc.line(20, y, 90, y);
    doc.line(120, y, 190, y);
    doc.setFontSize(10);
    doc.text("Entregado por", 55, y + 6, { align: "center" });
    doc.text("Recibido por", 155, y + 6, { align: "center" });
  }

  doc.save(`comprobante-${folioLabel(d.type, d.folio)}.pdf`);
}

export function generarComprobanteCompra(d: ComprobanteCompraData) {
  const doc = new jsPDF();
  const money = (value: number) =>
    `$ ${value.toLocaleString("es-CL", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;

  const fecha = new Date(d.created_at).toLocaleString("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  });

  const tipoDocumento =
    d.document_type === "factura" ? "Factura" : "Guía de despacho";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("BodegaPro", 14, 20);

  doc.setFontSize(15);
  doc.text("Comprobante de entrada de compra", 14, 31);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Fecha: ${fecha}`, 14, 40);
  doc.text(`Compra: ${d.id}`, 14, 46);
  doc.text(`Proveedor: ${d.supplier || "Sin proveedor"}`, 14, 54);
  doc.text(`Orden de compra: ${d.purchase_order || "—"}`, 14, 61);
  doc.text(`${tipoDocumento} N°: ${d.document_number}`, 14, 68);

  const rows = d.items.map((item) => [
    item.product_name,
    item.product_sku || "—",
    String(item.quantity),
    item.unit,
    money(item.unit_price),
    money(item.quantity * item.unit_price),
  ]);

  autoTable(doc, {
    startY: 77,
    head: [["Descripción", "SKU", "Cantidad", "Unidad", "Valor unitario", "Subtotal"]],
    body: rows,
    foot: [[
      { content: "TOTAL COMPRA", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
      {
        content: money(
          d.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0),
        ),
        styles: { fontStyle: "bold", halign: "right" },
      },
    ]],
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [40, 65, 90],
      textColor: 255,
    },
    columnStyles: {
      0: { cellWidth: 48 },
      1: { cellWidth: 22 },
      2: { halign: "right", cellWidth: 20 },
      3: { cellWidth: 22 },
      4: { halign: "right", cellWidth: 30 },
      5: { halign: "right", cellWidth: 30 },
    },
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.text("BodegaPro — Registro de compra", 14, 290);
    },
  });

  const finalY =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  if (d.notes) {
    const notesY = finalY > 255 ? 20 : finalY;
    if (finalY > 255) doc.addPage();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Observaciones", 14, notesY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(d.notes, 180), 14, notesY + 6);
  }

  const filename = d.id.replace(/[^a-zA-Z0-9-]/g, "");
  doc.save(`entrada-compra-${filename}.pdf`);
}
