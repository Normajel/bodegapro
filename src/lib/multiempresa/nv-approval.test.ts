import { describe, expect, it } from "vitest";
import { NV_APPROVAL_WRITES_ENABLED, NV_SUBMISSION_WRITES_ENABLED, canApproveNv, canSubmitNv, nvStatusLabel } from "./nv-approval";

describe("tenant NV status permissions", () => {
  it("Ventas can submit a draft but cannot approve it", () => {
    expect(canSubmitNv("VENTAS", "BORRADOR")).toBe(true);
    expect(canApproveNv("VENTAS", "PENDIENTE", "aal2")).toBe(false);
    expect(canSubmitNv("VENTAS", "APROBADA")).toBe(false);
  });
  it("Gerencia can approve only pending NV with MFA", () => {
    expect(canApproveNv("GERENCIA", "PENDIENTE", "aal2")).toBe(true);
    expect(canApproveNv("GERENCIA", "PENDIENTE", "aal1")).toBe(false);
    expect(canApproveNv("GERENTE", "BORRADOR", "aal2")).toBe(false);
  });
  it("Bodega cannot submit or approve NV", () => {
    expect(canSubmitNv("BODEGA", "BORRADOR")).toBe(false);
    expect(canApproveNv("BODEGA", "PENDIENTE", "aal2")).toBe(false);
  });
  it("all new write operations remain disabled for web users", () => {
    expect(NV_SUBMISSION_WRITES_ENABLED).toBe(false);
    expect(NV_APPROVAL_WRITES_ENABLED).toBe(false);
  });
  it("displays informative lifecycle states", () => {
    expect(nvStatusLabel("PENDIENTE")).toContain("Gerencia");
    expect(nvStatusLabel("APROBADA")).toContain("producción");
  });
});
