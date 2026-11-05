import { describe, expect, it } from "vitest";
import {
  PRODUCTION_AREAS,
  PRODUCTION_PLANNING_WRITES_ENABLED,
  canPlanProduction,
  validatePlanning,
} from "./production-planning";
const unit = { id: "u1", company_id: "a", status: "PENDIENTE_PLANIFICACION" };
const draft = {
  productionUnitId: "u1",
  area: "ESTRUCTURA" as const,
  priority: "ALTA" as const,
  plannedDate: "2026-11-10",
  notes: "",
};
describe("tenant production planning", () => {
  it("keeps nine areas in sequence", () => {
    expect(PRODUCTION_AREAS[0]).toBe("ESTRUCTURA");
    expect(PRODUCTION_AREAS.at(-1)).toBe("DETALLE");
  });
  it("rejects cross-company scheduling", () => {
    expect(validatePlanning(draft, unit, "a")).toBeNull();
    expect(validatePlanning(draft, unit, "b")).toContain("Empresa");
  });
  it("rejects impossible dates and finished modules", () => {
    expect(validatePlanning({ ...draft, plannedDate: "2026-02-30" }, unit, "a")).toContain("Fecha");
    expect(validatePlanning(draft, { ...unit, status: "TERMINADA" }, "a")).toContain("programable");
  });
  it("limits drafts to permitted management roles", () => {
    expect(canPlanProduction("GERENCIA")).toBe(true);
    expect(canPlanProduction("JEFE_PRODUCCION")).toBe(true);
    expect(canPlanProduction("BODEGA")).toBe(false);
  });
  it("does not enable production write operations", () => {
    expect(PRODUCTION_PLANNING_WRITES_ENABLED).toBe(false);
  });
});
