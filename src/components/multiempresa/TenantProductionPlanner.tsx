import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadMyCompanies } from "@/lib/multiempresa/company-api";
import { PRODUCTION_AREAS, PRODUCTION_PLANNING_WRITES_ENABLED, canPlanProduction, validatePlanning, type PlanningDraft } from "@/lib/multiempresa/production-planning";

type Unit = { id: string; company_id: string; sales_note_id: string; unit_code_snapshot: string; module_index: number; status: string };
export function TenantProductionPlanner({ companyId, units }: { companyId: string; units: Unit[] }) {
  const [selected, setSelected] = useState("");
  const [area, setArea] = useState<(typeof PRODUCTION_AREAS)[number]>("ESTRUCTURA");
  const [priority, setPriority] = useState<PlanningDraft["priority"]>("NORMAL");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [review, setReview] = useState<PlanningDraft | null>(null);
  const access = useQuery({
    queryKey: ["tenant", companyId, "production-planning-role"],
    queryFn: async () => {
      const options = await loadMyCompanies();
      return canPlanProduction(options.find(({ company }) => company.id === companyId)?.role);
    },
    staleTime: 0,
  });
  const unit = units.find((item) => item.id === selected);
  const draft: PlanningDraft = { productionUnitId: selected, area, priority, plannedDate: date, notes };
  const error = unit ? validatePlanning(draft, unit, companyId) : "Selecciona un módulo";
  if (access.isPending) return <p role="status">Verificando permisos de planificación…</p>;
  if (access.isError) return <p role="alert">No fue posible verificar los permisos.</p>;
  if (!access.data) return null;
  return (
    <section className="mt-5 rounded-lg border border-teal-200 bg-slate-50 p-4">
      <h3 className="font-semibold">Planificar módulo · borrador</h3>
      <p className="mt-1 text-sm text-slate-600">Esta vista no asigna ni cambia estados reales.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">Módulo físico
          <select value={selected} onChange={(e) => { setSelected(e.target.value); setReview(null); }}
            className="mt-1 block w-full rounded border bg-white p-2">
            <option value="">Seleccionar módulo</option>
            {units.filter((item) => ["PENDIENTE_PLANIFICACION","PROGRAMADA"].includes(item.status)).map((item) => (
              <option key={item.id} value={item.id}>{item.unit_code_snapshot} · módulo {item.module_index}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">Área inicial
          <select value={area} onChange={(e) => { setArea(e.target.value as PlanningDraft["area"]); setReview(null); }}
            className="mt-1 block w-full rounded border bg-white p-2">
            {PRODUCTION_AREAS.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">Prioridad
          <select value={priority} onChange={(e) => { setPriority(e.target.value as PlanningDraft["priority"]); setReview(null); }}
            className="mt-1 block w-full rounded border bg-white p-2">
            {["NORMAL", "ALTA", "URGENTE", "BAJA"].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">Fecha
          <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setReview(null); }}
            className="mt-1 block w-full rounded border bg-white p-2"/>
        </label>
      </div>
      <label className="mt-3 block text-sm font-semibold">Observaciones
        <textarea value={notes} maxLength={500} rows={2}
          onChange={(e) => { setNotes(e.target.value); setReview(null); }}
          className="mt-1 block w-full rounded border bg-white p-2"/>
      </label>
