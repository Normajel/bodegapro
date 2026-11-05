import { describe, expect, it } from "vitest";
import {
  STOCK_AUDIT_WRITES_ENABLED,
  validateAuditReason,
  validateAdjustedStock,
  canPrepareMovementCancellation,
} from "./stock-audit";

describe("tenant stock audit release gates and validation", () => {
  it("requires nonempty reasons up to 500 characters", () => {
    expect(validateAuditReason("   ")).toBeTruthy();
    expect(validateAuditReason("a".repeat(501))).toBeTruthy();
    expect(validateAuditReason("Inventario mensual")).toBeNull();
  });
  it("only accepts safe nonnegative integer CLP quantities", () => {
    for (const value of ["", "-1", "2.3", "1e3", "NaN", "Infinity", "1000000001"]) {
      expect(validateAdjustedStock(value)).toBeTruthy();
    }
    expect(validateAdjustedStock("0")).toBeNull();
    expect(validateAdjustedStock("1250")).toBeNull();
  });
  it("never proposes cancelling OC-linked, batched or already cancelled movements", () => {
    const standalone = {
      purchase_order_id: null, purchase_order_item_id: null,
      batch_id: null, alreadyCancelled: false,
    };
    expect(canPrepareMovementCancellation(standalone)).toBe(true);
    expect(canPrepareMovementCancellation({ ...standalone, purchase_order_id: "oc-1" })).toBe(false);
    expect(canPrepareMovementCancellation({ ...standalone, batch_id: "b-1" })).toBe(false);
    expect(canPrepareMovementCancellation({ ...standalone, alreadyCancelled: true })).toBe(false);
  });
  it("blocks inventory writes until live Auth and MFA tests", () => {
    expect(STOCK_AUDIT_WRITES_ENABLED).toBe(false);
  });
});
