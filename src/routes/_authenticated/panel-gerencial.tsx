import { createFileRoute } from "@tanstack/react-router";
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
} from "recharts";
import { getManagementData } from "@/lib/management.functions";
import {
  canViewManagement,
  summarizeManagement,
  cubicationRequirements,
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
  const requirements = data
    ? cubicationRequirements(selectedItems, data.products).filter(
        (p) => (!category || p.category === category) && (!product || p.id === product),
      )
    : [];
  const orders = data?.orders.filter((o) => o.status !== "anulada") ?? [];
  const orderStates = [
    { name: "Por aprobar", value: orders.filter((o) => o.approval_status !== "aprobada").length },
    {
      name: "Pendiente",
      value: orders.filter((o) => o.approval_status === "aprobada" && o.status === "pendiente")
        .length,
    },
    {
      name: "Parcial",
      value: orders.filter((o) => o.approval_status === "aprobada" && o.status === "parcial")
        .length,
    },
    { name: "Completa", value: orders.filter((o) => o.status === "completa").length },
  ];
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
            <ChartCard
              title="Diez productos con mayor valor de salida · CLP"
              empty={!summary.topExits.length}
            >
              <ResponsiveContainer>
                <BarChart
                  layout="vertical"
                  data={summary.topExits}
                  margin={{ left: 15, right: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={compact} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={costTooltip} />
                  <Bar dataKey="value" name="Salidas" fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Estado de órdenes creadas en el período" empty={!orders.length}>
              <ResponsiveContainer>
                <BarChart data={orderStates}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" name="Órdenes" fill="#7c3aed" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          <section className="card space-y-4 p-4">
            <h2 className="font-semibold">Cubicaciones · materiales por unidad/modelo</h2>
            <label className="block max-w-lg text-sm">
              Cubicación guardada
              <select
                className={field}
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              >
                <option value="">Seleccionar una cubicación</option>
                {data.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.unit_code}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm text-muted-foreground">
              Comparación para una unidad del modelo seleccionado. Las plantillas no representan
              pedidos confirmados ni reservas. El faltante es teórico frente al stock actual; no
              considera stock comprometido ni compras en tránsito. Los costos adicionales del
              documento no están guardados en la plantilla.
            </p>
            {!data.templates.length && <p>Aún no hay cubicaciones guardadas.</p>}
            {template && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    [
                      "Materiales estimados",
                      money(requirements.reduce((s, p) => s + p.estimatedCost, 0)),
                    ],
                    [
                      "Faltante estimado",
                      money(requirements.reduce((s, p) => s + p.shortageCost, 0)),
                    ],
                    [
                      "Productos faltantes",
                      String(requirements.filter((p) => p.missing > 0).length),
                    ],
                  ].map(([label, value]) => (
                    <div className="rounded-lg bg-muted p-3" key={label}>
                      <p className="text-sm">{label}</p>
                      <strong className="text-xl">{value}</strong>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr>
                        {[
                          "Material",
                          "Unidad",
                          "Requerido",
                          "Disponible",
                          "Faltante",
                          "Costo estimado",
                        ].map((h) => (
                          <th className="p-2" key={h}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {requirements.map((p) => (
                        <tr className="border-t" key={p.id}>
                          <td className="p-2">
                            {p.name}
                            {p.unit_cost <= 0 ? " · Sin costo" : ""}
                          </td>
                          <td>{p.unit}</td>
                          <td>{p.required}</td>
                          <td>{p.available}</td>
                          <td className={p.missing ? "font-semibold text-destructive" : ""}>
                            {p.missing}
                          </td>
                          <td>{money(p.estimatedCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!requirements.length && (
                    <p className="p-3">Sin materiales para esta selección.</p>
                  )}
                </div>
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
