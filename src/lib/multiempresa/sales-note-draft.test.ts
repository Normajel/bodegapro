import { describe, expect, it } from "vitest";
import {
  SALES_NOTE_WRITES_ENABLED,
  prepareTenantSalesNote,
  type SalesNoteDraft,
} from "./sales-note-draft";

const base: SalesNoteDraft = {
  companyId: "company",
  customerId: "customer",
  number: " NV-001 ",
  notes: "",
  units: [
    { kind: "normal", documentId: "doc-a", modules: "2" },
    { kind: "especial", documentId: "doc-b", modules: "3" },
  ],
};

describe("tenant sales note draft", () => {
  it("prepares independent normal and special cubicaciones", () => {
    const prepared = prepareTenantSalesNote(base);
    expect(prepared.number).toBe("NV-001");
    expect(prepared.totalModules).toBe(5);
    expect(prepared.units).toEqual([
      { kind: "normal", document_id: "doc-a", modules: 2 },
      { kind: "especial", document_id: "doc-b", modules: 3 },
    ]);
  });
  it("rejects incomplete or invalid NV documents", () => {
    expect(() => prepareTenantSalesNote({ ...base, customerId: "" })).toThrow();
    expect(() => prepareTenantSalesNote({ ...base, number: " " })).toThrow();
    expect(() => prepareTenantSalesNote({ ...base, units: [] })).toThrow();
    expect(() =>
      prepareTenantSalesNote({ ...base, units: [{ ...base.units[0]!, modules: "1.5" }] }),
    ).toThrow();
    expect(() =>
      prepareTenantSalesNote({
        ...base,
        units: base.units.map((unit) => ({ ...unit, modules: "600" })),
      }),
    ).toThrow();
    expect(() => prepareTenantSalesNote({ ...base, notes: "x".repeat(501) })).toThrow();
  });
  it("does not enable untested write operations", () => {
    expect(SALES_NOTE_WRITES_ENABLED).toBe(false);
  });
});
