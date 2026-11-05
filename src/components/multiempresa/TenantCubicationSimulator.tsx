import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  getTenantCubicationScenario,
  listTenantCubicationCatalog,
  tenantQueryKeys,
} from "@/lib/multiempresa/tenant-catalog";
import {
  simulateTenantCubication, simulateTenantSpecialCubication,
} from "@/lib/multiempresa/cubication-simulator";

type Props = {
  companyId: string;
  products: ReadonlyArray<{
    id: string; name: string; category: string; unit: string;
    stock_quantity: number; unit_cost: number; active: boolean;
  }>;
};

const clp = (value: number) => new Intl.NumberFormat("es-CL", {
  style: "currency", currency: "CLP", maximumFractionDigits: 0,
}).format(value);

export function TenantCubicationSimulator({ companyId, products }: Props) {
  const [selection, setSelection] = useState("");
  const [moduleInput, setModuleInput] = useState("1");
  const catalog = useQuery({
    queryKey: tenantQueryKeys.cubicationCatalog(companyId),
    queryFn: () => listTenantCubicationCatalog(companyId),
    enabled: !!companyId,
    staleTime: 0,
  });
  const chosen = catalog.data?.find((item) => selection === item.kind + ":" + item.id);
  const scenario = useQuery({
    queryKey: tenantQueryKeys.cubicationScenario(companyId, chosen?.kind ?? "", chosen?.id ?? ""),
    queryFn: () => getTenantCubicationScenario(companyId, chosen!.kind, chosen!.id),
    enabled: !!companyId && !!chosen,
    staleTime: 0,
  });
  const modules = Number(moduleInput);
  const countValid = /^\d+$/.test(moduleInput) && Number.isSafeInteger(modules) && modules >= 1 && modules <= 1000;
  const materialCatalog = products.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    unit: p.unit,
    available: Number(p.stock_quantity),
    unitCost: Number(p.unit_cost),
    active: p.active,
  }));

  let normal: ReturnType<typeof simulateTenantCubication> | null = null;
  let special: ReturnType<typeof simulateTenantSpecialCubication> | null = null;
  let simulationError = "";
  if (scenario.isSuccess && countValid) {
    try {
      if (scenario.data.kind === "normal") {
        normal = simulateTenantCubication(scenario.data.lines, materialCatalog, modules);
      } else {
        special = simulateTenantSpecialCubication(scenario.data.lines, modules);
      }
    } catch (error) {
      simulationError = error instanceof Error ? error.message : "No se pudo simular la cubicación.";
    }
  }
  const rows = normal?.rows ?? [];
  const costChart = normal?.coveragePercent !== null && normal?.coveragePercent !== undefined
    ? [
        { name: "Cubierto con stock", value: normal.coveredCost },
        { name: "Por adquirir", value: normal.shortageCost },
      ].filter((part) => part.value > 0)
    : [];

  return (
    <section aria-label="Simulador gerencial de cubicación" className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-4">
        <h2 className="text-lg font-bold">Simulador de cubicaciones</h2>
        <p className="mt-1 text-sm text-slate-600">
          Calcula materiales y costos de una unidad guardada para varios módulos.
          La simulación es informativa: no reserva, compra ni descuenta stock.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Unidad de cubicación
          <select
            value={selection}
            onChange={(event) => { setSelection(event.target.value); setModuleInput("1"); }}
            className="mt-1 w-full rounded border border-slate-300 bg-white p-2"
          >
            <option value="">Selecciona una unidad guardada</option>
            {(catalog.data ?? []).map((item) => (
              <option key={item.kind + ":" + item.id} value={item.kind + ":" + item.id}>
                {item.unit_code} — {item.kind === "normal" ? "Normal" : "Especial"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Módulos a fabricar
          <input
            type="text"
            inputMode="numeric"
            value={moduleInput}
            onChange={(event) => setModuleInput(event.target.value)}
            className="mt-1 w-full rounded border border-slate-300 p-2"
            aria-invalid={!countValid}
            placeholder="Entre 1 y 1000"
          />
        </label>
      </div>
      {catalog.isPending && <p role="status" className="mt-3 text-sm">Consultando cubicaciones guardadas…</p>}
      {catalog.isError && <p role="alert" className="mt-3 text-sm text-red-700">No se pudo cargar el catálogo de cubicaciones.</p>}
      {catalog.isSuccess && catalog.data.length === 0 && (
        <p className="mt-3 text-sm text-slate-600">No hay cubicaciones guardadas para esta empresa.</p>
      )}
      {chosen && scenario.isPending && <p role="status" className="mt-3 text-sm">Consultando materiales…</p>}
      {chosen && scenario.isError && <p role="alert" className="mt-3 text-sm text-red-700">No se pudo consultar esta cubicación.</p>}
      {!countValid && <p role="alert" className="mt-3 text-sm text-amber-800">Ingresa entre 1 y 1000 módulos, sin decimales.</p>}
      {simulationError && <p role="alert" className="mt-3 text-sm text-red-700">{simulationError}</p>}
      {normal && (
        <div className="mt-5 space-y-4">
          {normal.rows.length === 0 && (
            <p className="text-sm text-amber-800">Esta unidad no contiene materiales normales que puedan calcularse.</p>
          )}
          {normal.missingProductIds.length > 0 && (
            <p role="alert" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Hay {normal.missingProductIds.length} producto(s) que ya no están activos o no están disponibles en el catálogo.
              La capacidad de fabricación se considera cero hasta corregir esos datos.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "Módulos simulados", value: modules.toLocaleString("es-CL") },
              { title: "Módulos posibles con stock", value: normal.maxModules.toLocaleString("es-CL") },
              { title: "Materiales faltantes", value: normal.missingCount.toLocaleString("es-CL") },
              { title: "Costo estimado de faltantes", value: clp(normal.shortageCost) },
              { title: "Costo total de materiales", value: clp(normal.totalCost) },
            ].map((metric) => (
              <div key={metric.title} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-600">{metric.title}</p>
                <p className="mt-1 text-lg font-bold">{metric.value}</p>
              </div>
            ))}
          </div>
          {normal.unpricedCount > 0 && (
            <p className="text-sm text-amber-800">
              Hay {normal.unpricedCount} material(es) sin costo positivo. Los importes mostrados son incompletos.
            </p>
          )}
          {normal.coveragePercent !== null && (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={costChart} dataKey="value" nameKey="name" innerRadius={47} outerRadius={80}>
                      {costChart.map((entry, index) => (
                        <Cell key={entry.name} fill={index === 0 ? "#0d9488" : "#f59e0b"} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => clp(Number(value))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col justify-center gap-2">
                <p className="text-sm font-semibold">Cobertura valorizada</p>
                <p className="text-3xl font-bold text-teal-700">
                  {normal.coveragePercent.toLocaleString("es-CL", { maximumFractionDigits: 1 })}%
                </p>
                <p className="text-xs text-slate-600">
                  Basada en costos unitarios actuales y únicamente en materiales con precio registrado.
                </p>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2">Por módulo</th>
                  <th className="px-3 py-2">Necesario</th>
                  <th className="px-3 py-2">Disponible</th>
                  <th className="px-3 py-2">Faltante</th>
                  <th className="px-3 py-2">Costo faltante</th>
                </tr>
              </thead>
              <tbody>
                {[...rows].sort((a, b) => b.missing - a.missing).map((row) => (
                  <tr key={row.productId} className="border-t">
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2">{row.perModule} {row.unit}</td>
                    <td className="px-3 py-2">{row.required}</td>
                    <td className="px-3 py-2">{row.available}</td>
                    <td className="px-3 py-2 font-semibold">{row.missing}</td>
                    <td className="px-3 py-2">{row.costAvailable ? clp(row.shortageCost) : "Sin precio"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {special && (
        <div className="mt-5 space-y-4">
          <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Los productos especiales se adquieren según necesidad y no tienen stock.
            No es posible calcular capacidad física de fabricación con estos materiales.
          </p>
          <p className="text-xl font-bold">Compra especial estimada: {clp(special.totalCost)}</p>
          {special.unpricedCount > 0 && <p className="text-sm text-amber-800">
            Hay {special.unpricedCount} producto(s) especiales sin precio; el costo es incompleto.
          </p>}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2">Producto especial</th>
                  <th className="px-3 py-2">Por módulo</th>
                  <th className="px-3 py-2">Cantidad a adquirir</th>
                  <th className="px-3 py-2">Costo estimado</th>
                </tr>
              </thead>
              <tbody>
                {special.rows.map((row, index) => (
                  <tr key={row.productId + ":" + index} className="border-t">
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2">{row.quantity}</td>
                    <td className="px-3 py-2">{row.required}</td>
                    <td className="px-3 py-2">{row.costAvailable ? clp(row.estimatedCost) : "Sin precio"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="mt-4 text-xs text-slate-500">
        Simulación exclusivamente de lectura. No modifica cubicaciones, órdenes ni inventario.
      </p>
    </section>
  );
}
