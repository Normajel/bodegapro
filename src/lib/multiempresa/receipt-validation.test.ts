import { describe, expect, it } from "vitest";
import { validateReceiptDraft, validateReceiptDocument } from "./receipt-validation";

describe("validateReceiptDraft", () => {
  it("accepts a partial or complete receipt", () => {
    expect(validateReceiptDraft("4", 10)).toBeNull();
    expect(validateReceiptDraft("10", 10)).toBeNull();
  });

  it("rejects zero, negatives, decimals, missing and non-numeric values", () => {
    for (const invalid of ["", "0", "-1", "1.5", "abc", "1e2"]) {
      expect(validateReceiptDraft(invalid, 10)).not.toBeNull();
    }
  });

  it("rejects quantities exceeding the pending balance", () => {
    expect(validateReceiptDraft("11", 10)).not.toBeNull();
  });

  it("rejects unsafe integers or corrupt pending quantities", () => {
    expect(validateReceiptDraft("999999999999999999", 20)).not.toBeNull();
    expect(validateReceiptDraft("1", -1)).not.toBeNull();
  });
});

describe("validateReceiptDocument", () => {
  it("requires a valid guide or invoice number", () => {
    expect(validateReceiptDocument("guia", "1234")).toBeNull();
    expect(validateReceiptDocument("factura", "FAC-123")).toBeNull();
    expect(validateReceiptDocument("guia", "  ")).not.toBeNull();
    expect(validateReceiptDocument("otro", "123")).not.toBeNull();
    expect(validateReceiptDocument("guia", "N° <script>")).not.toBeNull();
    expect(validateReceiptDocument("guia", "A".repeat(61))).not.toBeNull();
  });
});
