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
    new Date(d.created_at).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }),
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
  if (d.type === "salida") rows.push(["Tipo de unidad", d.unit_type ? UNIT_TYPE_LABELS[d.unit_type] ?? d.unit_type : "—"]);
  else rows.push(["Proveedor", d.supplier || "—"]);
  rows.push(["Nombre maestro", d.master_name || "—"]);
  rows.push(["Observaciones", d.notes || "—"]);

  autoTable(doc, {
    startY: 40,
    body: rows,
    theme: "grid",
    styles: { fontSize: 11, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 55, fillColor: [245, 245, 245] } },
  });

  const y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? 120) + 35;
  doc.line(20, y, 90, y);
  doc.line(120, y, 190, y);
  doc.setFontSize(10);
  doc.text("Entregado por", 55, y + 6, { align: "center" });
  doc.text("Recibido por", 155, y + 6, { align: "center" });

  doc.save(`comprobante-${folioLabel(d.type, d.folio)}.pdf`);
}
