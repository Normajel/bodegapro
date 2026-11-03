import { validateReceiptDocument, validateReceiptDraft } from "./receipt-validation";

export type ReceiptLineInput = {
  purchase_order_item_id: string;
  item_type: string;
  product_id: string | null;
  pending_quantity: number;
};

export type ReceiptBatchDraft = {
  companyId: string;
  orderId: string;
  documentType: string;
  documentNumber: string;
  notes: string;
  quantities: Record<string, string>;
};

export type ReceiptBatchPayload = {
  p_company_id: string;
  p_order_id: string;
  p_items: Array<{ item_id: string; quantity: number }>;
  p_document_type: "guia" | "factura";
  p_document_number: string;
  p_notes: string | null;
};

/** Pure draft -> RPC payload conversion. Does not write data or trust client authorization. */
export function prepareReceiptBatch(
  draft: ReceiptBatchDraft,
  lines: readonly ReceiptLineInput[],
): ReceiptBatchPayload {
  if (!draft.companyId || !draft.orderId) {
    throw new Error("Selecciona una empresa y una orden de compra.");
  }
  const documentError = validateReceiptDocument(draft.documentType, draft.documentNumber);
  if (documentError) throw new Error(documentError);
  if (draft.notes.length > 500) throw new Error("Las observaciones superan 500 caracteres.");

  const allowed = new Map(lines.map((line) => [line.purchase_order_item_id, line]));
  const items: ReceiptBatchPayload["p_items"] = [];
  for (const [id, input] of Object.entries(draft.quantities)) {
    if (!input.trim()) continue;
    const line = allowed.get(id);
    if (!line || line.item_type !== "producto" || !line.product_id) {
      throw new Error("La recepción contiene un producto no autorizado para stock.");
    }
    const error = validateReceiptDraft(input, line.pending_quantity);
    if (error) throw new Error(`${error} (producto ${id})`);
    items.push({ item_id: id, quantity: Number(input.trim()) });
  }
  if (!items.length) throw new Error("Selecciona al menos un producto a recepcionar.");
  if (items.length > 100) throw new Error("Máximo 100 productos por recepción.");
  items.sort((a, b) => a.item_id.localeCompare(b.item_id));

  return {
    p_company_id: draft.companyId,
    p_order_id: draft.orderId,
    p_items: items,
    p_document_type: draft.documentType as "guia" | "factura",
    p_document_number: draft.documentNumber.trim(),
    p_notes: draft.notes.trim() || null,
  };
}
