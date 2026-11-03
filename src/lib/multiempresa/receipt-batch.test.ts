import { describe, expect, it } from "vitest";
import { prepareReceiptBatch } from "./receipt-batch";

const lines = [
  { purchase_order_item_id: "i-a", item_type: "producto", product_id: "p-a", pending_quantity: 5 },
  { purchase_order_item_id: "i-b", item_type: "producto", product_id: "p-b", pending_quantity: 4 },
  { purchase_order_item_id: "i-s", item_type: "servicio", product_id: null, pending_quantity: 2 },
];

const draft = {
  companyId: "company-a",
  orderId: "oc-a",
  documentType: "guia",
  documentNumber: " G-42 ",
  notes: "Recibido",
  quantities: { "i-b": "2", "i-a": "5" },
};

describe("prepareReceiptBatch", () => {
  it("builds a stable multi-line batch payload for one company", () => {
    expect(prepareReceiptBatch(draft, lines)).toEqual({
      p_company_id: "company-a",
      p_order_id: "oc-a",
      p_document_type: "guia",
      p_document_number: "G-42",
      p_notes: "Recibido",
      p_items: [
        { item_id: "i-a", quantity: 5 },
        { item_id: "i-b", quantity: 2 },
      ],
    });
  });

  it("rejects service items and unknown products", () => {
    expect(() => prepareReceiptBatch({ ...draft, quantities: { "i-s": "1" } }, lines)).toThrow();
    expect(() => prepareReceiptBatch({ ...draft, quantities: { "other": "1" } }, lines)).toThrow();
  });

  it("rejects excess, negative, decimals, empty batches and invalid documents", () => {
    for (const value of ["6", "-1", "1.5", "0"]) {
      expect(() => prepareReceiptBatch({ ...draft, quantities: { "i-a": value } }, lines)).toThrow();
    }
    expect(() => prepareReceiptBatch({ ...draft, quantities: {} }, lines)).toThrow();
    expect(() => prepareReceiptBatch({ ...draft, documentNumber: "" }, lines)).toThrow();
  });

  it("does not mutate the input draft", () => {
    prepareReceiptBatch(draft, lines);
    expect(draft.quantities["i-b"]).toBe("2");
  });
});
