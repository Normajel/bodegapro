import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { useActiveCompany } from "@/lib/multiempresa/company-context";
import { loadMyCompanies } from "@/lib/multiempresa/company-api";
import {
  listTenantManagementProducts,
  listTenantManagementOrders,
  listTenantManagementMovements,
  tenantQueryKeys,
} from "@/lib/multiempresa/tenant-catalog";
import {
  summarizeTenantManagement,
  tenantMovementSeries,
} from "@/lib/multiempresa/management-summary";
import { tenantManagementAlerts } from "@/lib/multiempresa/management-alerts";
import { TenantCubicationSimulator } from "./TenantCubicationSimulator";

const colors = ["#0d9488", "#2563eb", "#f59e0b", "#8b5cf6", "#64748b", "#ef4444"];
const clp = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);

function initialDates() {
  const now = new Date();
  const to = now.toLocaleDateString("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const monthStart = to.slice(0, 7) + "-01";
  return { from: monthStart, to };
}

export function TenantManagementDashboard() {
  const companyId = useActiveCompany();
  const queryClient = useQueryClient();
  const [dates, setDates] = useState(initialDates);
  const [category, setCategory] = useState("");
  const [mode, setMode] = useState<"daily" | "cumulative">("daily");
  const [refreshing, setRefreshing] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const access = useQuery({
    queryKey: ["tenant", companyId ?? "", "management-access"],
    queryFn: async () => {
      const list = await loadMyCompanies();
      const role = list.find((item) => item.company.id === companyId)?.role;
      return role ?? null;
    },
    enabled: !!companyId,
    staleTime: 0,
  });
  const authorized = ["ADMIN", "ADMINPRO", "GERENCIA", "GERENTE"].includes(access.data ?? "");
  const products = useQuery({
    queryKey: tenantQueryKeys.managementProducts(companyId ?? ""),
    queryFn: () => listTenantManagementProducts(companyId!),
    enabled: !!companyId && authorized,
    staleTime: 0,
  });
  const orders = useQuery({
    queryKey: tenantQueryKeys.managementOrders(companyId ?? ""),
    queryFn: () => listTenantManagementOrders(companyId!),
    enabled: !!companyId && authorized,
    staleTime: 0,
  });
  const dateValid = dates.from <= dates.to && dates.from.length === 10 && dates.to.length === 10;
  const movements = useQuery({
    queryKey: tenantQueryKeys.managementMovements(companyId ?? "", dates.from, dates.to),
    queryFn: () => listTenantManagementMovements(companyId!, dates.from, dates.to),
    enabled: !!companyId && authorized && dateValid,
    staleTime: 0,
  });

  const ready = products.isSuccess && orders.isSuccess && movements.isSuccess;
  const summary = ready
    ? summarizeTenantManagement(products.data, orders.data, movements.data, category)
    : null;
  const trend = movements.data ? tenantMovementSeries(movements.data, mode === "cumulative") : [];
  const alerts = summary ? tenantManagementAlerts(access.data, summary) : [];
  const visibleAlerts = alerts.filter(
    (alert) => !dismissed.includes((companyId ?? "") + ":" + alert.id),
  );
  const categoryRows = summary?.categoryValues.filter((item) => item.value > 0) ?? [];
  const orderRows = summary?.orderGroups.filter((item) => item.count > 0) ?? [];
  const options = [...new Set((products.data ?? []).map((product) => product.category))].sort();
  const currentCategory = options.includes(category) ? category : "";

  async function refresh() {
    if (!companyId) return;
    setRefreshing(true);
    setDismissed((items) => items.filter((item) => !item.startsWith(companyId + ":")));
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tenantQueryKeys.managementProducts(companyId) }),
        queryClient.invalidateQueries({ queryKey: tenantQueryKeys.managementOrders(companyId) }),
        queryClient.invalidateQueries({ queryKey: ["tenant", companyId, "management-movements"] }),
        queryClient.invalidateQueries({ queryKey: ["tenant", companyId, "management-access"] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-8">
      <header className="rounded-xl bg-gradient-to-r from-slate-900 to-teal-700 p-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-100">
          INTEGRASTOCK · Multiempresa
        </p>
        <h1 className="mt-1 text-2xl font-bold">Panel Gerencial</h1>
        <p className="mt-2 text-sm text-teal-100">
          Indicadores de inventario y órdenes, exclusivos de la empresa activa.
        </p>
      </header>

      {!companyId && <p role="status">Selecciona una empresa para consultar sus indicadores.</p>}
      {companyId && access.isPending && <p role="status">Verificando permisos gerenciales…</p>}
      {companyId && access.isError && <p role="alert">No se pudieron verificar los permisos.</p>}
      {companyId && access.isSuccess && !authorized && (
        <p role="alert">Acceso exclusivo para Admin, AdminPro y Gerencia de esta empresa.</p>
      )}

      {authorized && (
        <>
          <section
            className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
            aria-label="Filtros gerenciales"
          >
            <label className="text-sm font-medium">
              Desde
              <input
                type="date"
                value={dates.from}
                onChange={(e) => setDates((old) => ({ ...old, from: e.target.value }))}
                className="mt-1 block w-full rounded border border-slate-300 p-2"
              />
            </label>
            <label className="text-sm font-medium">
              Hasta
              <input
                type="date"
                value={dates.to}
                onChange={(e) => setDates((old) => ({ ...old, to: e.target.value }))}
                className="mt-1 block w-full rounded border border-slate-300 p-2"
              />
            </label>
            <label className="text-sm font-medium">
              Categoría (stock)
              <select
                value={currentCategory}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 bg-white p-2"
              >
                <option value="">Todas</option>
                {options.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="self-end rounded bg-teal-700 p-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {refreshing ? "Actualizando…" : "Actualizar datos"}
            </button>
          </section>
          {!dateValid && <p role="alert">El rango de fechas no es válido.</p>}
          {(products.isPending || orders.isPending || movements.isPending) && dateValid && (
            <p role="status">Consultando datos de la empresa…</p>
          )}
          {(products.isError || orders.isError || movements.isError) && (
            <p role="alert" className="rounded border border-red-200 p-3 text-red-700">
              No se pudieron cargar todos los datos. No mostraremos totales incompletos.
            </p>
          )}
          {summary && dateValid && (
            <>
              <section aria-label="Notificaciones de la empresa" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">Avisos de Gerencia y Administración</h2>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {visibleAlerts.length} aviso(s)
                  </span>
                </div>
                {visibleAlerts.length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {visibleAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="flex items-start justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950"
                      >
                        <p className="text-sm">
                          <strong>{alert.count}</strong> · {alert.label}
                        </p>
                        <button
                          type="button"
                          aria-label={`Descartar aviso de ${alert.label}`}
                          onClick={() =>
                            setDismissed((old) => [...old, (companyId ?? "") + ":" + alert.id])
                          }
                          className="rounded border border-amber-400 px-2 py-1 text-xs font-bold"
                        >
                          X
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">
                    No hay avisos pendientes para mostrar. Pulsa Actualizar datos para volver a
                    consultar.
                  </p>
                )}
              </section>
              <section
                aria-label="Indicadores de inventario y compras"
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
              >
                {[
                  { title: "Inventario valorizado", value: clp(summary.inventoryValue) },
                  {
                    title: "Productos activos",
                    value: summary.activeProducts.toLocaleString("es-CL"),
                  },
                  {
                    title: "Stock crítico",
                    value: summary.criticalProducts.toLocaleString("es-CL"),
                  },
                  {
                    title: "OC por aprobar",
                    value: summary.pendingApproval.toLocaleString("es-CL"),
                  },
                  {
                    title: "Productos por recepcionar (OC)",
                    value: summary.pendingReceipt.toLocaleString("es-CL"),
                  },
                  {
                    title: "Servicios ACEPTADOS",
                    value: summary.acceptedServices.toLocaleString("es-CL"),
                  },
                  { title: "Entradas (unidades)", value: summary.entries.toLocaleString("es-CL") },
                  { title: "Salidas (unidades)", value: summary.exits.toLocaleString("es-CL") },
                ].map((item) => (
                  <div key={item.title} className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs font-medium text-slate-600">{item.title}</p>
                    <p className="mt-2 text-xl font-bold text-slate-900">{item.value}</p>
                  </div>
                ))}
              </section>
              <p className="text-xs text-amber-800">
                La valorización usa costos unitarios actuales. Entradas y salidas se expresan en
                cantidades físicas, no en CLP históricos. {summary.noCostProducts} productos con
                stock carecen de precio unitario positivo. No se combinan servicios con productos en
                las OC.
              </p>
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <h2 className="font-semibold">Valorización por categoría</h2>
                  {categoryRows.length ? (
                    <div className="mt-3 h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryRows}
                            nameKey="name"
                            dataKey="value"
                            cx="45%"
                            cy="48%"
                            outerRadius={95}
                          >
                            {categoryRows.map((item, i) => (
                              <Cell key={item.name} fill={colors[i % colors.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => clp(Number(value))} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-600">Sin inventario valorizado.</p>
                  )}
                  <ul className="mt-3 space-y-1 text-sm">
                    {categoryRows.map((item) => (
                      <li key={item.name} className="flex justify-between gap-3">
                        <span>{item.name}</span>
                        <strong>{clp(item.value)}</strong>
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <h2 className="font-semibold">Órdenes de compra por estado</h2>
                  {orderRows.length ? (
                    <div className="mt-3 h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={orderRows}
                            nameKey="name"
                            dataKey="count"
                            innerRadius={48}
                            outerRadius={95}
                          >
                            {orderRows.map((item, i) => (
                              <Cell key={item.name} fill={colors[i % colors.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-600">Sin órdenes registradas.</p>
                  )}
                  <ul className="mt-3 space-y-1 text-sm">
                    {orderRows.map((item) => (
                      <li key={item.name} className="flex justify-between gap-3">
                        <span>{item.name}</span>
                        <strong>{item.count}</strong>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-semibold">Flujo de bodega · unidades por fecha</h2>
                  <label className="text-sm">
                    Presentación
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value as "daily" | "cumulative")}
                      className="ml-2 rounded border border-slate-300 bg-white p-2"
                    >
                      <option value="daily">Diario</option>
                      <option value="cumulative">Acumulado</option>
                    </select>
                  </label>
                </div>
                {trend.length ? (
                  <div className="mt-3 h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={trend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="Entradas" fill="#0d9488" />
                        {mode === "daily" ? (
                          <Bar dataKey="Salidas" fill="#f59e0b" />
                        ) : (
                          <Line dataKey="Salidas" stroke="#f59e0b" strokeWidth={3} dot={false} />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-600">
                    Sin movimientos en el período seleccionado.
                  </p>
                )}
                <p className="mt-2 text-xs text-slate-600">
                  Los movimientos individuales anulados se excluyen. Las cantidades de artículos con
                  diferentes unidades de medida se agregan como unidades registradas; no equivalen a
                  un único volumen físico.
                </p>
              </section>
              {companyId && (
                <TenantCubicationSimulator
                  key={companyId}
                  companyId={companyId}
                  products={products.data ?? []}
                />
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
