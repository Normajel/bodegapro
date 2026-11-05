export const PRODUCTION_PLANNING_WRITES_ENABLED = false;
export const PRODUCTION_AREAS = ["ESTRUCTURA", "PINTURA", "CARPINTERIA", "PISO_LINOLEO", "CIRCUITO_ELECTRONICO", "ARTEFACTO_ELECTRICO", "FUSION", "ARTEFACTO_GASFITERIA", "DETALLE"] as const;
export type ProductionArea = (typeof PRODUCTION_AREAS)[number];
export type PlanningPriority = "URGENTE" | "ALTA" | "NORMAL" | "BAJA";
export type PlanningDraft = { productionUnitId: string; area: ProductionArea; priority: PlanningPriority; plannedDate: string; notes: string };
export const canPlanProduction = (role: string | null | undefined) =>
  ["ADMIN", "ADMINPRO", "GERENCIA", "GERENTE", "JEFE_PRODUCCION"].includes(role?.toUpperCase() ?? "");
export function validatePlanning(d: PlanningDraft, unit: { id: string; company_id: string; status: string }, companyId: string): string | null {
  if (!companyId || unit.company_id !== companyId) return "Empresa incorrecta";
  if (d.productionUnitId !== unit.id) return "Unidad incorrecta";
  if (!["PENDIENTE_PLANIFICACION", "PROGRAMADA"].includes(unit.status)) return "Unidad no programable";
  if (!PRODUCTION_AREAS.includes(d.area)) return "Área inválida";
  if (!["URGENTE", "ALTA", "NORMAL", "BAJA"].includes(d.priority)) return "Prioridad inválida";
  if (d.notes.length > 500) return "Observaciones demasiado largas";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.plannedDate);
  if (!match) return "Fecha inválida";
  const y = Number(match[1]), m = Number(match[2]), day = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, day));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== day) return "Fecha inválida";
  return null;
}
