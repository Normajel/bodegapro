import { useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  getTenantCubicationScenario,
  listTenantCubicationCatalog,
  tenantQueryKeys,
} from "@/lib/multiempresa/tenant-catalog";
import {
  simulateTenantSaleScenario,
  type SaleScenarioItem,
} from "@/lib/multiempresa/sale-simulator";
import type { SimulationMaterial } from "@/lib/multiempresa/cubication-simulator";

type DraftUnit = { key: number; selection: string; quantity: string };
type Props = {
  companyId: string;
  products: readonly {
    id: string;
    name: string;
    category: string;
    unit: string;
    stock_quantity: number;
    unit_cost: number;
    active: boolean;
  }[];
};

const money = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);

export function TenantSaleSimulator({ companyId, products }: Props) {
  const [saleNumber, setSaleNumber] = useState("");
  const [drafts, setDrafts] = useState<DraftUnit[]>([{ key: 1, selection: "", quantity: "1" }]);
  const [nextId, setNextId] = useState(2);

  const catalog = useQuery({
    queryKey: tenantQueryKeys.cubicationCatalog(companyId),
    queryFn: () => listTenantCubicationCatalog(companyId),
    staleTime: 0,
  });

  const chosen = drafts.map((draft) => ({
    ...draft,
    item: catalog.data?.find((record) => record.kind + ":" + record.id === draft.selection),
  }));
  const scenarios = useQueries({
    queries: chosen.map((draft) => ({
      queryKey: tenantQueryKeys.cubicationScenario(
        companyId,
        draft.item?.kind ?? "",
        draft.item?.id ?? "",
      ),
      queryFn: () => getTenantCubicationScenario(companyId, draft.item!.kind, draft.item!.id),
      enabled: !!draft.item,
      staleTime: 0,
    })),
  });

  const ready =
    !!catalog.data &&
    drafts.every((draft) => !!draft.selection) &&
    chosen.every((draft) => !!draft.item) &&
    scenarios.every((query) => query.isSuccess);
  const loading =
    catalog.isPending || scenarios.some((query) => query.isPending && query.fetchStatus !== "idle");
  const failed = catalog.isError || scenarios.some((query) => query.isError);
  const materials: SimulationMaterial[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    unit: product.unit,
    available: Number(product.stock_quantity),
    unitCost: Number(product.unit_cost),
    active: product.active,
  }));
  let result: ReturnType<typeof simulateTenantSaleScenario> | null = null;
  let validationError = "";
  if (ready && !failed) {
    try {
      const selections: SaleScenarioItem[] = chosen.map((draft, index) => {
        const scenario = scenarios[index]?.data;
        if (!scenario) throw new Error("La cubicación no está disponible.");
        const modules = Number(draft.quantity);
        if (!/^\d+$/.test(draft.quantity) || !Number.isSafeInteger(modules)) {
          throw new Error("Cada unidad necesita una cantidad entera positiva.");
        }
        return {
          key: String(draft.key),
          kind: scenario.kind,
          documentId: draft.item!.id,
          unitCode: scenario.unitCode,
          modules,
          lines: scenario.lines,
        };
      });
      result = simulateTenantSaleScenario(selections, materials);
    } catch (error) {
      validationError = error instanceof Error ? error.message : "No se pudo simular la venta.";
    }
  }

  function updateLine(key: number, changes: Partial<DraftUnit>) {
    setDrafts((previous) =>
      previous.map((unit) => (unit.key === key ? { ...unit, ...changes } : unit)),
    );
  }
  const canAdd = drafts.length < 50;
  return (
    <section
      aria-label="Simulación consolidada de Nota de Venta"
      className="rounded-xl border border-slate-200 bg-white p-4"
    >
      <header>
        <h2 className="text-lg font-bold">Simular Nota de Venta · varios módulos</h2>
        <p className="mt-1 text-sm text-slate-600">
          Escenario sin guardar. Cada módulo mantiene su propia cubicación y se consolidan
          materiales comunes para calcular los faltantes de toda la venta.
        </p>
      </header>
      <label className="mt-4 block max-w-md text-sm font-semibold">
        Identificador de la venta (referencia de simulación)
        <input
          value={saleNumber}
          maxLength={60}
          placeholder="Ej.: NV-2026-001"
          onChange={(event) => setSaleNumber(event.target.value)}
          className="mt-1 block w-full rounded border border-slate-300 p-2"
        />
      </label>
      <div className="mt-4 space-y-3">
        {drafts.map((draft, index) => (
          <div key={draft.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Unidad {index + 1}</h3>
              {drafts.length > 1 && (
                <button
                  type="button"
                  onClick={() => setDrafts((rows) => rows.filter((row) => row.key !== draft.key))}
                  className="rounded border border-red-300 px-3 py-1 text-xs font-semibold text-red-700"
                >
                  Quitar
                </button>
              )}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="text-sm font-medium sm:col-span-2">
                Cubicación guardada
                <select
                  value={draft.selection}
                  onChange={(event) => updateLine(draft.key, { selection: event.target.value })}
                  className="mt-1 block w-full rounded border border-slate-300 bg-white p-2"
                >
                  <option value="">Seleccionar una cubicación</option>
                  {(catalog.data ?? []).map((item) => (
                    <option key={item.kind + ":" + item.id} value={item.kind + ":" + item.id}>
                      {item.unit_code} — {item.kind === "normal" ? "Normal" : "Especial"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Cantidad de módulos
                <input
                  inputMode="numeric"
                  value={draft.quantity}
                  onChange={(event) => updateLine(draft.key, { quantity: event.target.value })}
                  className="mt-1 block w-full rounded border border-slate-300 p-2"
                  aria-label={`Cantidad de módulos de unidad ${index + 1}`}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={!canAdd}
        onClick={() => {
          setDrafts((previous) => [...previous, { key: nextId, selection: "", quantity: "1" }]);
          setNextId((current) => current + 1);
        }}
        className="mt-3 rounded border border-teal-600 px-4 py-2 text-sm font-semibold text-teal-800 disabled:opacity-50"
      >
        Agregar otra unidad
      </button>

      {loading && (
        <p role="status" className="mt-3 text-sm">
          Cargando cubicaciones de esta empresa…
        </p>
      )}
      {failed && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          No se pudieron consultar todas las cubicaciones. No se mostrarán totales incompletos.
        </p>
      )}
      {catalog.isSuccess && catalog.data.length === 0 && (
        <p className="mt-3 text-sm text-slate-600">
          Primero debes guardar al menos una cubicación en esta empresa.
        </p>
      )}
      {validationError && (
        <p role="alert" className="mt-3 text-sm text-amber-800">
          {validationError}
        </p>
      )}
      {result && (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "Total de módulos", value: result.totalModules.toLocaleString("es-CL") },
              {
                title: "Materiales con faltantes",
                value: result.missingMaterials.toLocaleString("es-CL"),
              },
              { title: "Compra de materiales normales", value: money(result.normalShortageCost) },
              { title: "Compra de especiales", value: money(result.specialAcquisitionCost) },
              {
                title: "Total de adquisición estimada",
                value: money(result.estimatedAcquisitionCost),
              },
              {
                title: "Costo total de materiales",
                value: money(result.totalEstimatedMaterialCost),
              },
            ].map((card) => (
              <div key={card.title} className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-600">{card.title}</p>
                <p className="mt-1 text-lg font-bold">{card.value}</p>
              </div>
            ))}
          </div>
          <p
            className={
              result.normalAvailabilityCovered ? "text-sm text-teal-800" : "text-sm text-amber-900"
            }
          >
            {result.normalAvailabilityCovered
              ? "Las cantidades normales de esta simulación se encuentran cubiertas por el stock consultado."
              : "La venta requiere compra de materiales normales o revisión del catálogo antes de producir."}
          </p>
          {result.unpricedCount > 0 && (
            <p
              role="alert"
              className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            >
              Hay {result.unpricedCount} material(es) sin precio positivo; los costos son
              incompletos.
            </p>
          )}
          {result.missingReferences.length > 0 && (
            <p role="alert" className="text-sm text-red-700">
              Hay {result.missingReferences.length} producto(s) normales inactivos o no disponibles.
              Revisa las cubicaciones antes de tomar decisiones.
            </p>
          )}
          <h3 className="font-semibold">Materiales normales consolidados</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-2">Material</th>
                  <th className="p-2">Requerido</th>
                  <th className="p-2">Disponible</th>
                  <th className="p-2">Faltante</th>
                  <th className="p-2">Compra estimada</th>
                </tr>
              </thead>
              <tbody>
                {[...result.normalRows]
                  .sort((a, b) => b.missing - a.missing)
                  .map((row) => (
                    <tr key={row.productId} className="border-t">
                      <td className="p-2">{row.name}</td>
                      <td className="p-2">
                        {row.required} {row.unit}
                      </td>
                      <td className="p-2">{row.available}</td>
                      <td className="p-2">{row.missing}</td>
                      <td className="p-2">
                        {row.costAvailable ? money(row.shortageCost) : "Sin precio"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {result.normalRows.length === 0 && (
              <p className="p-3 text-sm text-slate-600">
                No hay materiales normales en esta simulación.
              </p>
            )}
          </div>
          <h3 className="font-semibold">Productos especiales por adquirir</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-2">Producto</th>
                  <th className="p-2">Cantidad</th>
                  <th className="p-2">Costo estimado</th>
                </tr>
              </thead>
              <tbody>
                {result.specialRows.map((row) => (
                  <tr key={row.productId} className="border-t">
                    <td className="p-2">{row.name}</td>
                    <td className="p-2">{row.required}</td>
                    <td className="p-2">
                      {row.costAvailable ? money(row.estimatedCost) : "Sin precio"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.specialRows.length === 0 && (
              <p className="p-3 text-sm text-slate-600">No se incluyen productos especiales.</p>
            )}
          </div>
          <p className="text-xs text-slate-600">
            {saleNumber.trim() ? `Referencia ${saleNumber.trim()} · ` : ""}
            {result.capacityWarning} Los costos no incluyen flete, impuestos ni mano de obra.
          </p>
        </div>
      )}
      <p className="mt-4 text-xs font-semibold text-slate-600">
        Esta es una simulación, no una Nota de Venta registrada. No genera reservas, compras ni
        movimientos.
      </p>
    </section>
  );
}
