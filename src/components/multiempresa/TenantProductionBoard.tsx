import { useQuery } from "@tanstack/react-query";
import { TenantProductionPlanner } from "./TenantProductionPlanner";
import {
  listTenantProductionUnits,
  listTenantSalesNotes,
  tenantQueryKeys,
} from "@/lib/multiempresa/tenant-catalog";

/** Informational board; production assignments and stage transitions are not yet enabled. */
export function TenantProductionBoard({ companyId }: { companyId: string }) {
  const units = useQuery({
    queryKey: tenantQueryKeys.productionUnits(companyId),
    queryFn: () => listTenantProductionUnits(companyId),
    staleTime: 0,
  });
  const notes = useQuery({
    queryKey: tenantQueryKeys.salesNotes(companyId),
    queryFn: () => listTenantSalesNotes(companyId),
    staleTime: 0,
  });
  const numberById = new Map((notes.data ?? []).map((note) => [note.id, note.note_number]));
  const pending = (units.data ?? []).filter(
    (unit) => unit.status === "PENDIENTE_PLANIFICACION",
  ).length;

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white p-4"
      aria-label="Unidades pendientes de planificación"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Producción · unidades pendientes</h2>
          <p className="mt-1 text-sm text-slate-600">
            Gerencia aprueba la NV y el sistema prepara un registro por módulo físico. La asignación
            de áreas y trabajadores aún no está habilitada.
          </p>
        </div>
        {units.isSuccess && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">
            {pending} sin planificar
          </span>
        )}
      </div>
      {(units.isPending || notes.isPending) && (
        <p role="status" className="mt-3 text-sm">
          Consultando producción…
        </p>
      )}
      {(units.isError || notes.isError) && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          No fue posible cargar todas las unidades de producción.
        </p>
      )}
      {units.isSuccess && notes.isSuccess && units.data.length === 0 && (
        <p className="mt-3 text-sm text-slate-600">No hay módulos enviados a Producción.</p>
      )}
      {units.isSuccess && notes.isSuccess && units.data.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-2">Nota de Venta</th>
                <th className="p-2">Unidad</th>
                <th className="p-2">Módulo</th>
                <th className="p-2">Estado</th>
                <th className="p-2">Área</th>
                <th className="p-2">Prioridad</th>
                <th className="p-2">Fecha programada</th>
              </tr>
            </thead>
            <tbody>
              {units.data.map((unit) => (
                <tr key={unit.id} className="border-t">
                  <td className="p-2">
                    {numberById.get(unit.sales_note_id) ?? unit.sales_note_id.slice(0, 8)}
                  </td>
                  <td className="p-2">{unit.unit_code_snapshot}</td>
                  <td className="p-2">{unit.module_index}</td>
                  <td className="p-2">
                    {unit.status === "PENDIENTE_PLANIFICACION"
                      ? "Pendiente de planificación"
                      : unit.status}
                  </td>
                  <td className="p-2">{unit.planned_area?.replaceAll("_", " ") ?? "Sin asignar"}</td>
                  <td className="p-2">{unit.priority ?? "—"}</td>
                  <td className="p-2">{unit.planned_date ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {units.isSuccess && (
        <TenantProductionPlanner key={companyId} companyId={companyId} units={units.data} />
      )}
      <p className="mt-3 text-xs text-slate-500">
        Vista de consulta por empresa. No programa trabajos, no genera descuentos de inventario y no
        cambia estados de producción.
      </p>
    </section>
  );
}
