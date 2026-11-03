import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { getManagementData } from "@/lib/management.functions";
import {
  canViewManagement,
  summarizeManagement,
  simulateCubication,
  stockOf,
} from "@/lib/management";
import { useAppAccess } from "@/lib/permissions";
import { money, dateKey } from "@/lib/warehouse";

export const Route = createFileRoute("/_authenticated/panel-gerencial")({
  head: () => ({ meta: [{ title: "Panel Gerencial — INTEGRASTOCK" }] }),
  component: ManagementPage,
});
const compact = (value: number) =>
  new Intl.NumberFormat("es-CL", { notation: "compact", maximumFractionDigits: 1 }).format(value);
function ChartCard({
  title,
  children,
  empty = false,
}: {
  title: string;
  children: ReactNode;
  empty?: boolean;
}) {
  return (
    <section className="card min-w-0 p-4">
      <h2 className="mb-4 font-semibold">{title}</h2>
      {empty ? (
        <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Sin registros para esta selección.
        </p>
      ) : (
        <div className="h-72 w-full">{children}</div>
      )}
    </section>
  );
}
function ManagementPage() {
  const access = useAppAccess();
  return canViewManagement(access?.name, access?.permissions) ? (
    <ManagementPanel />
  ) : (
    <p role="alert">Acceso exclusivo para Admin y Gerencia.</p>
  );
}
function ManagementPanel() {
  const today = dateKey(new Date());
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [category, setCategory] = useState("");
  const [product, setProduct] = useState("");
  const [template, setTemplate] = useState("");
  const [moduleCountDraft, setModuleCountDraft] = useState("1");
  const [detail, setDetail] = useState(false);
  const access = useAppAccess();
  const valid = from <= to && !!from && !!to && Date.parse(to) - Date.parse(from) <= 366 * 86400000;
  const query = useQuery({
    queryKey: ["management", access?.name, from, to],
    queryFn: () => getManagementData({ data: { from, to } }),
    enabled: valid,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const field = "w-full rounded-md border border-border bg-background p-2 text-sm";
  const data = query.data;
  const summary = data
    ? summarizeManagement(data.products, data.movements, category, product)
    : null;
  const selectedItems = data?.items.filter((i) => i.template_id === template) ?? [];
  const modules = Math.max(1, Math.min(1000, Math.trunc(Number(moduleCountDraft) || 1)));
  const scenario = data && template
    ? simulateCubication(selectedItems, data.products, modules)
    : null;
  const percentCL = (value: number) =>
    value.toLocaleString("es-CL", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const countCL = (value: number) => value.toLocaleString("es-CL", { maximumFractionDigits: 2 });
  const coverageData = scenario && scenario.coverageByValue !== null
    ? [
        { name: "Cubierto con stock", value: scenario.coveredCost, color: "#0d9488" },
        { name: "Por adquirir", value: scenario.shortageCost, color: "#f59e0b" },
      ].filter((part) => part.value > 0)
    : [];
  const criticalMaterials = [...(scenario?.rows ?? [])]
    .filter((item) => item.required > 0)
    .sort((a, b) => a.available / a.required - b.available / b.required)
    .slice(0, 8);
  // Estados actuales de las OC creadas en el período seleccionado.
  // Las anuladas se muestran por separado, sin mezclarlas con compras vigentes.
  const orders = data?.orders ?? [];
  const orderCategories = [
    {
      key: "approvals",
      name: "Por aprobar",
      color: "#f59e0b",
      description: "Esperando autorización de Gerencia",
      matches: (order: (typeof orders)[number]) =>
        order.status !== "anulada" && order.approval_status !== "aprobada",
    },
    {
      key: "pending",
      name: "Pendiente de recepción",
      color: "#2563eb",
      description: "Aprobadas, sin entrega completa",
      matches: (order: (typeof orders)[number]) =>
        order.status === "pendiente" && order.approval_status === "aprobada",
    },
    {
      key: "partial",
      name: "Recepción parcial",
      color: "#8b5cf6",
      description: "Productos aún por recepcionar",
      matches: (order: (typeof orders)[number]) =>
        order.status === "parcial" && order.approval_status === "aprobada",
    },
    {
      key: "complete",
      name: "Recibida completa",
      color: "#0d9488",
      description: "Recepción terminada",
      matches: (order: (typeof orders)[number]) => order.status === "completa",
    },
    {
      key: "cancelled",
      name: "Anulada",
      color: "#94a3b8",
      description: "Órdenes sin vigencia",
      matches: (order: (typeof orders)[number]) => order.status === "anulada",
    },
  ];
  const orderStates = orderCategories.map((category) => {
    const matches = orders.filter(category.matches);
    return {
      ...category,
      value: matches.length,
      amount: matches.reduce((total, order) => total + Number(order.total_amount ?? 0), 0),
    };
  });
  const displayedOrderStates = orderStates.filter((state) => state.value > 0);
  const orderCount = orders.length;
  const awaitingApproval = orderStates[0].value;
  const awaitingReceipt = orderStates[1].value + orderStates[2].value;
  const completedOrders = orderStates[3].value;
  const cancelledOrders = orderStates[4].value;
  const activeOrderAmount = orderStates
    .filter((state) => state.key !== "cancelled")
    .reduce((total, state) => total + state.amount, 0);
  const orderShare = (count: number) =>
    (orderCount > 0 ? (count / orderCount) * 100 : 0).toLocaleString("es-CL", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    });

  const costTooltip = (v: number) => money(v);
  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-gradient-to-r from-slate-900 to-teal-700 p-6 text-white">
        <p className="text-xs uppercase tracking-widest">INTEGRASTOCK · Uso gerencial</p>
        <h1 className="mt-1 text-2xl font-bold">Panel Gerencial</h1>
        <p className="mt-2 text-sm text-teal-100">
          Inventario, movimientos, compras y cubicaciones en una sola vista.
        </p>
      </div>
      <section
        className="card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5"
        aria-label="Filtros del panel"
      >
        <label className="text-sm">
          Desde
          <input
            type="date"
            className={field}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Hasta
          <input type="date" className={field} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="text-sm">
          Categoría
          <select
            className={field}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setProduct("");
            }}
          >
            <option value="">Todas</option>
            {[...new Set(data?.products.map((p) => p.category) ?? [])].sort().map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Producto
          <select className={field} value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="">Todos</option>
            {data?.products
              .filter((p) => !category || p.category === category)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <button
          className="btn btn-secondary self-end"
          disabled={query.isFetching || !valid}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? "Actualizando…" : "Actualizar datos"}
        </button>
      </section>
      {!valid && <p role="alert">Selecciona fechas válidas en un período de hasta un año.</p>}
      {query.isPending && valid && <p role="status">Cargando registros reales…</p>}
      {query.isError && (
        <p role="alert" className="card p-4 text-destructive">
          No se pudo actualizar el panel. {query.error.message}{" "}
          <button className="underline" onClick={() => void query.refetch()}>
            Reintentar
          </button>
        </p>
      )}
      {data && summary && valid && (
        <>
          <p className="text-xs text-muted-foreground">
            Consulta:{" "}
            {new Date(data.generatedAt).toLocaleString("es-CL", { timeZone: "America/Santiago" })} ·
            Actualización cada minuto. Fechas: movimientos y OC creadas en el período. Inventario y
            cubicaciones: estado actual. Categoría y producto: inventario, movimientos y cubicación;
            las OC se filtran solo por fecha.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [
                "Valor actual de bodega",
                money(summary.stockValue),
                "Stock × costo unitario registrado",
              ],
              [
                "Entradas del período",
                money(summary.entriesValue),
                "Movimientos registrados con costo",
              ],
              [
                "Salidas del período",
                money(summary.exitsValue),
                "Movimientos registrados con costo",
              ],
              [
                "Productos críticos",
                String(summary.critical.length),
                "Incluye agotados y bajo mínimo",
              ],
            ].map(([title, value, note]) => (
              <div key={title} className="card border-t-4 border-t-teal-500 p-4">
                <p className="text-sm text-muted-foreground">{title}</p>
                <p className="my-2 text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{note}</p>
              </div>
            ))}
          </div>
          {(summary.missingCosts > 0 || summary.unpriced > 0) && (
            <p
              role="status"
              className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
            >
              Valorización incompleta: {summary.missingCosts} movimientos sin costo histórico y{" "}
              {summary.unpriced} productos con stock sin costo positivo. No se reemplazan costos
              históricos faltantes con precios actuales.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Entradas y salidas representan el registro de movimientos, incluidos ajustes y reversas;
            no equivalen a ventas ni a compras netas facturadas. Los valores de stock y cubicación
            usan el costo actual registrado.
          </p>
          <div className="grid gap-5 xl:grid-cols-2">
            <ChartCard
              title="Valor de inventario por categoría · CLP"
              empty={!summary.categories.length}
            >
              <ResponsiveContainer>
                <BarChart
                  data={summary.categories}
                  onClick={(state) => {
                    const row = state?.activePayload?.[0]?.payload as { name?: string } | undefined;
                    if (row?.name) {
                      setCategory(row.name);
                      setProduct("");
                      setDetail(true);
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={compact} />
                  <Tooltip formatter={costTooltip} />
                  <Bar dataKey="value" name="Valor actual" fill="#0d9488" cursor="pointer" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Entradas y salidas por día · CLP" empty={!summary.trend.length}>
              <ResponsiveContainer>
                <LineChart data={summary.trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={compact} />
                  <Tooltip formatter={costTooltip} />
                  <Legend />
                  <Line dataKey="Entradas" stroke="#0d9488" />
                  <Line dataKey="Salidas" stroke="#2563eb" />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
            <section className="card min-w-0 space-y-4 p-4" aria-labelledby="top-exits-title">
              <div>
                <h2 id="top-exits-title" className="font-semibold">
                  Diez productos con mayor valor de salida · CLP
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Valor histórico de movimientos de salida en el período seleccionado
                </p>
              </div>
              {!summary.topExits.length ? (
                <p className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
                  Sin salidas valorizadas para esta selección.
                </p>
              ) : (
                <>
                  <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                    <div className="relative mx-auto h-64 w-full max-w-sm"
                      role="img" aria-label="Distribución del valor de salida de los productos principales">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={summary.topExits}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius="64%"
                            outerRadius="88%"
                            paddingAngle={summary.topExits.length > 1 ? 2 : 0}
                            stroke="none"
                          >
                            {summary.topExits.map((item, index) => (
                              <Cell
                                key={item.name}
                                fill={["#0d9488","#2563eb","#f59e0b","#8b5cf6","#ef4444",
                                  "#06b6d4","#65a30d","#f97316","#d946ef","#64748b"][index % 10]}
                              />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => money(Number(value))} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-lg font-bold tabular-nums">
                          {money(summary.topExits.reduce((total, item) => total + item.value, 0))}
                        </span>
                        <span className="text-xs text-muted-foreground">total representado</span>
                      </div>
                    </div>
                    <ol className="space-y-2" aria-label="Valor de salida por producto">
                      {summary.topExits.map((item, index) => {
                        const total = summary.topExits.reduce((sum, row) => sum + row.value, 0);
                        const percent = total > 0 ? item.value / total * 100 : 0;
                        return (
                          <li key={item.name} className="flex items-start gap-3 rounded-lg border border-border p-3">
                            <span aria-hidden="true" className="mt-1.5 h-3 w-3 shrink-0 rounded-full"
                              style={{ backgroundColor: ["#0d9488","#2563eb","#f59e0b","#8b5cf6","#ef4444",
                                "#06b6d4","#65a30d","#f97316","#d946ef","#64748b"][index % 10] }} />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                                <p className="min-w-0 flex-1 break-words text-sm font-medium">{item.name}</p>
                                <span className="shrink-0 text-sm font-bold tabular-nums">{money(item.value)}</span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {percent.toLocaleString("es-CL", { maximumFractionDigits: 1 })}% del top 10
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    El porcentaje corresponde únicamente a los productos de este ranking.
                    Incluye ajustes y reversas registrados como salidas; no representa ventas netas facturadas.
                  </p>
                </>
              )}
            </section>
            <section className="card min-w-0 space-y-4 p-4" aria-labelledby="orders-status-title">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 id="orders-status-title" className="font-semibold">
                    Estado de órdenes creadas en el período
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Distribución actual por estado · incluye OC anuladas
                  </p>
                </div>
                <Link to="/compras" className="text-sm font-medium text-primary underline underline-offset-2">
                  Ver órdenes
                </Link>
              </div>
              {orderCount === 0 ? (
                <p className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
                  Sin órdenes de compra creadas en este período.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Indicadores de órdenes">
                    {[
                      { label: "Total de OC", value: orderCount, color: "text-foreground" },
                      { label: "Por aprobar", value: awaitingApproval, color: "text-amber-600" },
                      { label: "Por recepcionar", value: awaitingReceipt, color: "text-blue-600" },
                      { label: "Completas", value: completedOrders, color: "text-teal-600" },
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl border border-border bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                        <p className={`mt-1 text-2xl font-bold tabular-nums ${item.color}`}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                    <div className="relative mx-auto h-64 w-full max-w-sm" role="img"
                      aria-label={`Distribución de ${orderCount} órdenes: ${displayedOrderStates
                        .map((state) => `${state.name}, ${state.value}`).join("; ")}`}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={displayedOrderStates}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius="64%"
                            outerRadius="88%"
                            paddingAngle={displayedOrderStates.length > 1 ? 3 : 0}
                            stroke="none"
                          >
                            {displayedOrderStates.map((state) => (
                              <Cell key={state.key} fill={state.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value, _name, props) => {
                              const state = props.payload as (typeof orderStates)[number];
                              return [
                                `${Number(value)} OC · ${orderShare(Number(value))}% · ${money(state.amount)}`,
                                state.name,
                              ];
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-bold tabular-nums">{orderCount}</span>
                        <span className="text-xs text-muted-foreground">órdenes del período</span>
                      </div>
                    </div>
                    <div className="space-y-2" aria-label="Desglose por estado">
                      {orderStates.map((state) => (
                        <div key={state.key} className="rounded-lg border border-border p-3">
                          <div className="flex items-start gap-3">
                            <span aria-hidden="true" className="mt-1.5 h-3 w-3 shrink-0 rounded-full"
                              style={{ backgroundColor: state.color }} />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline justify-between gap-1">
                                <span className="text-sm font-semibold">{state.name}</span>
                                <span className="text-sm font-bold tabular-nums">
                                  {state.value} OC · {orderShare(state.value)}%
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground">{state.description}</p>
                              <p className="mt-1 text-sm font-medium tabular-nums">{money(state.amount)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Monto de OC vigentes del período</p>
                      <p className="text-lg font-bold tabular-nums">{money(activeOrderAmount)}</p>
                    </div>
                    {cancelledOrders > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {cancelledOrders} OC anulada{cancelledOrders === 1 ? "" : "s"} excluida{cancelledOrders === 1 ? "" : "s"} del monto vigente
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Las cifras corresponden a órdenes creadas entre {from} y {to}, según su estado actual.
                    Los montos son los totales registrados en cada OC; no equivalen a pagos realizados
                    ni al valor efectivamente recepcionado. Los pendientes de otros períodos no están incluidos.
                  </p>
                </>
              )}
            </section>
          </div>
          <section className="card min-w-0 space-y-5 p-4" aria-labelledby="cubication-title">
            <div>
              <h2 id="cubication-title" className="text-lg font-semibold">
                Cubicaciones · planificación de materiales
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Simulador de costos y disponibilidad de stock para el modelo seleccionado.
              </p>
            </div>
            <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="block text-sm">
                Cubicación guardada
                <select className={field} value={template} onChange={(e) => setTemplate(e.target.value)}>
                  <option value="">Seleccionar una cubicación</option>
                  {data.templates.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.unit_code}</option>
                  ))}
                </select>
              </label>
              <div className="min-w-0">
                <label htmlFor="simulated-modules" className="block text-sm">
                  Módulos a simular
                </label>
                <div className="flex items-center gap-2">
                  <button type="button" className="btn btn-secondary h-10 w-10 shrink-0"
                    aria-label="Disminuir módulos" disabled={modules <= 1}
                    onClick={() => setModuleCountDraft(String(Math.max(1, modules - 1)))}>
                    −
                  </button>
                  <input id="simulated-modules" type="text" inputMode="numeric" pattern="[0-9]*"
                    className="input h-10 w-24 text-center tabular-nums"
                    value={moduleCountDraft}
                    onChange={(e) => {
                      if (/^\d{0,4}$/.test(e.target.value)) setModuleCountDraft(e.target.value);
                    }}
                    onBlur={() => setModuleCountDraft(String(modules))}
                    aria-describedby="simulated-modules-help" />
                  <button type="button" className="btn btn-secondary h-10 w-10 shrink-0"
                    aria-label="Aumentar módulos" disabled={modules >= 1000}
                    onClick={() => setModuleCountDraft(String(Math.min(1000, modules + 1)))}>
                    +
                  </button>
                </div>
                <p id="simulated-modules-help" className="mt-1 text-xs text-muted-foreground">
                  De 1 a 1.000 unidades
                </p>
              </div>
            </div>
            {!data.templates.length && (
              <p className="text-sm text-muted-foreground">Aún no hay cubicaciones guardadas.</p>
            )}
            {!template && data.templates.length > 0 && (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                Selecciona un modelo para conocer costos, faltantes y capacidad teórica de fabricación.
              </p>
            )}
            {scenario && (
              <>
                <p className="text-xs text-muted-foreground">
                  Escenario hipotético para {modules} módulo{modules === 1 ? "" : "s"}.
                  Los materiales se calculan sobre toda la cubicación, independientemente de los
                  filtros de categoría y producto del panel. No reserva ni descuenta inventario.
                </p>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  {[
                    { label: "Costo estimado de materiales", value: money(scenario.totalCost), note: "Según costo unitario actual" },
                    { label: "Faltante por comprar", value: money(scenario.shortageCost), note: "Valor teórico de materiales insuficientes" },
                    { label: "Productos con faltantes", value: String(scenario.missingProducts.length), note: "Referencias con stock insuficiente" },
                    { label: "Módulos cubiertos por stock", value: String(scenario.maxModules), note: "Máximo teórico con existencias actuales" },
                  ].map((item) => (
                    <div key={item.label} className="min-w-0 rounded-xl bg-muted/60 p-3">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="mt-1 break-words text-lg font-bold tabular-nums sm:text-xl">
                        {item.value}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
                    </div>
                  ))}
                </div>
                {(scenario.unpriced.length > 0 || scenario.unknownProductIds.length > 0) && (
                  <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                    Estimación incompleta: {scenario.unpriced.length} materiales sin costo unitario
                    positivo y {scenario.unknownProductIds.length} referencias de cubicación no
                    encontradas en inventario. Estos materiales no están completamente valorizados;
                    revisa la plantilla antes de tomar decisiones de compra.
                  </p>
                )}
                {!scenario.rows.length && (
                  <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    Esta cubicación no contiene materiales reconocidos con cantidades positivas.
                  </p>
                )}
                {scenario.rows.length > 0 && (
                  <>
                    <div className="grid gap-4 xl:grid-cols-2">
                      <div className="min-w-0 space-y-3 rounded-xl border border-border p-3">
                        <h3 className="font-semibold">Cobertura valorizada de materiales</h3>
                        {scenario.coverageByValue === null ? (
                          <p className="py-10 text-center text-sm text-muted-foreground">
                            Sin costos positivos para calcular la cobertura por valor.
                          </p>
                        ) : (
                          <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                            <div className="relative mx-auto h-52 w-full max-w-xs"
                              role="img" aria-label={`Cobertura por valor: ${percentCL(scenario.coverageByValue ?? 0)} por ciento`}>
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie data={coverageData} dataKey="value" nameKey="name"
                                    cx="50%" cy="50%" innerRadius="66%" outerRadius="88%"
                                    paddingAngle={coverageData.length > 1 ? 2 : 0} stroke="none">
                                    {coverageData.map((slice) => (
                                      <Cell key={slice.name} fill={slice.color} />
                                    ))}
                                  </Pie>
                                  <Tooltip formatter={(value) => money(Number(value))} />
                                </PieChart>
                              </ResponsiveContainer>
                              <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-2xl font-bold tabular-nums">
                                  {percentCL(scenario.coverageByValue)}%
                                </span>
                                <span className="text-xs text-muted-foreground">por valor</span>
                              </div>
                            </div>
                            <div className="space-y-3 text-sm">
                              <div className="flex items-start gap-2">
                                <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full bg-teal-600" />
                                <div><p className="text-muted-foreground">Cubierto por stock</p>
                                  <p className="font-semibold">{money(scenario.coveredCost)}</p></div>
                              </div>
                              <div className="flex items-start gap-2">
                                <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full bg-amber-500" />
                                <div><p className="text-muted-foreground">Faltante valorizado</p>
                                  <p className="font-semibold">{money(scenario.shortageCost)}</p></div>
                              </div>
                            </div>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Esta cobertura es monetaria, no una confirmación de que el módulo pueda
                          fabricarse completo. Se calcula únicamente con costos registrados.
                        </p>
                      </div>
                      <div className="min-w-0 space-y-3 rounded-xl border border-border p-3">
                        <h3 className="font-semibold">Costo de materiales por categoría</h3>
                        {scenario.categories.length ? (
                          <div className="space-y-3">
                            {scenario.categories.map((entry, index) => (
                              <div key={entry.name} className="space-y-1.5">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                  <span className="text-sm">{entry.name}</span>
                                  <span className="text-sm font-semibold tabular-nums">{money(entry.value)}</span>
                                </div>
                                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                                  <div className="h-full rounded-full"
                                    style={{
                                      width: `${scenario.totalCost > 0 ? Math.min(100, entry.value / scenario.totalCost * 100) : 0}%`,
                                      backgroundColor: ["#0d9488", "#2563eb", "#8b5cf6", "#f59e0b", "#64748b"][index % 5],
                                    }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="py-10 text-center text-sm text-muted-foreground">
                            Sin categorías valorizadas para este modelo.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <h3 className="font-semibold">Disponibilidad por material · principales alertas</h3>
                      <p className="text-xs text-muted-foreground">
                        Ordenado por menor cobertura. Cada barra compara la cantidad disponible
                        con lo requerido para {modules} módulo{modules === 1 ? "" : "s"}.
                        Las unidades de medida se mantienen separadas.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {criticalMaterials.map((material) => {
                          const pct = material.required > 0
                            ? Math.max(0, Math.min(100, material.available / material.required * 100))
                            : 100;
                          return (
                            <div key={material.id} className="min-w-0 rounded-lg border border-border p-3">
                              <div className="flex items-start justify-between gap-2">
                                <p className="min-w-0 break-words text-sm font-medium">{material.name}</p>
                                <span className={`shrink-0 text-sm font-bold tabular-nums ${pct < 100 ? "text-amber-600" : "text-teal-600"}`}>
                                  {percentCL(pct)}%
                                </span>
                              </div>
                              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
                                <div className={`h-full rounded-full ${pct < 30 ? "bg-red-500" : pct < 100 ? "bg-amber-500" : "bg-teal-600"}`}
                                  style={{ width: `${pct}%` }} />
                              </div>
                              <p className="mt-2 text-xs text-muted-foreground">
                                {countCL(material.available)} disponibles /
                                {" "}{countCL(material.required)} {material.unit} requeridos
                              </p>
                              {material.missing > 0 && (
                                <p className="mt-1 text-xs font-semibold text-destructive">
                                  Faltan {countCL(material.missing)} {material.unit} · {money(material.shortageCost)}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-semibold">Detalle completo para preparar compras</h3>
                      <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full min-w-[690px] text-left text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              {["Material","Unidad","Requerido","Disponible","Faltante","Costo materiales","Valor faltante"].map((label) => (
                                <th className="whitespace-nowrap p-2" key={label}>{label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[...scenario.rows].sort((a,b) => b.shortageCost - a.shortageCost).map((material) => (
                              <tr key={material.id} className="border-t border-border">
                                <td className="p-2 font-medium">{material.name}
                                  {material.unit_cost <= 0 ? " · Sin costo" : ""}
                                </td>
                                <td className="p-2">{material.unit}</td>
                                <td className="p-2 tabular-nums">{countCL(material.required)}</td>
                                <td className="p-2 tabular-nums">{countCL(material.available)}</td>
                                <td className={`p-2 tabular-nums ${material.missing ? "font-semibold text-destructive" : ""}`}>
                                  {countCL(material.missing)}
                                </td>
                                <td className="p-2 tabular-nums">{money(material.estimatedCost)}</td>
                                <td className="p-2 tabular-nums">{money(material.shortageCost)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
                <p className="text-xs text-muted-foreground">
                  El simulador utiliza stock actual y costos unitarios existentes. No considera
                  reservas, consumos planificados, compras en tránsito, mano de obra ni otros
                  costos adicionales. La cantidad fabricable es teórica y se refiere solamente a
                  materiales de inventario de esta plantilla; no representa capacidad productiva.
                </p>
              </>
            )}
          </section>
          <section className="card p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <h2 className="font-semibold">Detalle de inventario</h2>
              <button className="btn btn-secondary" onClick={() => setDetail(!detail)}>
                {detail ? "Ocultar detalle" : "Ver productos y alertas"}
              </button>
            </div>
            {detail && (
              <div className="mt-3 max-h-96 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      {["Producto", "Unidad", "Stock actual", "Mínimo", "Valor", "Estado"].map(
                        (h) => (
                          <th className="p-2" key={h}>
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.active.map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="p-2">{p.name}</td>
                        <td>{p.unit}</td>
                        <td>{stockOf(p)}</td>
                        <td>{p.min_stock}</td>
                        <td>{money(stockOf(p) * p.unit_cost)}</td>
                        <td>
                          {stockOf(p) <= 0
                            ? "Agotado"
                            : stockOf(p) <= p.min_stock
                              ? "Crítico"
                              : "Disponible"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
