export const PRODUCTION_PLANNING_WRITES_ENABLED = false;
export const PRODUCTION_AREAS = ["ESTRUCTURA", "PINTURA", "CARPINTERIA", "PISO_LINOLEO", "CIRCUITO_ELECTRONICO", "ARTEFACTO_ELECTRICO", "FUSION", "ARTEFACTO_GASFITERIA", "DETALLE"] as const;
export type ProductionArea = (typeof PRODUCTION_AREAS)[number];
export type PlanningPriority = "URGENTE" | "ALTA" | "NORMAL" | "BAJA";
export type PlanningDraft = { productionUnitId: string; area: ProductionArea; priority: PlanningPriority; plannedDate: string; notes: string };
export const canPlanProduction = (role: string | null | undefined) =>
  ["ADMIN", "ADMINPRO", "GERENCIA", "GERENTE", "JEFE_PRODUCCION"].includes(role?.toUpperCase() ?? "");
