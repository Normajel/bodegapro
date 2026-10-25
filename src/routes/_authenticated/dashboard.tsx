import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { dateKey, santiagoDateTimeIso } from "@/lib/warehouse";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Panel — BodegaPro" },
      {
        name: "description",
        content: "Resumen del estado de tu bodega: stock, alertas y movimientos recientes.",
      },
    ],
  }),
  component: DashboardPage,
});

type ChartPeriod = "today" | "7days";
type ChartMetric = "value" | "quantity";

function formatCLP(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `$${safeValue.toLocaleString("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function finiteNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function DashboardPage() {
  const queryClient = useQueryClient();
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("7days");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("value");
  const [criticalOpen, setCriticalOpen] = useState(false);
  const todayKey = dateKey(new Date());
  const chartStartDay = useMemo(() => {
    const start = new Date(`${todayKey}T12:00:00Z`);
    if (chartPeriod === "7days") start.setUTCDate(start.getUTCDate() - 6);
    return start.toISOString().slice(0, 10);
  }, [chartPeriod, todayKey]);
  const chartStartIso = santiagoDateTimeIso(chartStartDay);
  const chartEndIso = santiagoDateTimeIso(todayKey, 24);

  useEffect(() => {
    const channel = supabase
      .channel("dashboard-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => {
        queryClient.invalidateQueries({ queryKey: ["products"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-movements"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements" }, () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard-movements"] });
        queryClient.invalidateQueries({ queryKey: ["products"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const {
    data: products = [],
    isLoading: productsLoading,
    isError: productsError,
  } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const pageSize = 1000;
      const rows = [];
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .order("name")
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        rows.push(...data);
        if (data.length < pageSize) return rows;
      }
    },
  });

  const {
    data: movements = [],
    isLoading: movementsLoading,
    isError: movementsError,
  } = useQuery({
    queryKey: ["dashboard-movements", chartStartIso, chartEndIso],
    queryFn: async () => {
      const pageSize = 1000;
      const rows = [];
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from("stock_movements")
          .select("*, products(name, sku, unit, unit_cost)")
          .gte("created_at", chartStartIso)
          .lt("created_at", chartEndIso)
          .order("created_at", { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        rows.push(...data);
        if (data.length < pageSize) return rows;
      }
    },
  });

  const activeProducts = products.filter((product) => product.active);
  const criticalProducts = activeProducts.filter(
    (product) =>
      finiteNumber(product.stock_quantity ?? product.stock) <= finiteNumber(product.min_stock),
  );
  const sortedCritical = [...criticalProducts].sort(
    (a, b) => finiteNumber(a.stock_quantity ?? a.stock) - finiteNumber(b.stock_quantity ?? b.stock),
  );
  const outOfStockCount = criticalProducts.filter(
    (product) => finiteNumber(product.stock_quantity ?? product.stock) <= 0,
  ).length;
  const stockValue = activeProducts.reduce(
    (sum, product) =>
      sum + finiteNumber(product.stock_quantity ?? product.stock) * finiteNumber(product.unit_cost),
    0,
  );
  const movementsToday = movements.filter((movement) => dateKey(movement.created_at) === todayKey);
  const entriesToday = movementsToday.filter((movement) => movement.type === "entrada");
  const exitsToday = movementsToday.filter((movement) => movement.type === "salida");
  const movementCost = (movement: (typeof movements)[number]) =>
    finiteNumber(movement.unit_cost, finiteNumber(movement.products?.unit_cost));
  const movementQuantity = (movement: (typeof movements)[number]) =>
    finiteNumber(movement.quantity_value, finiteNumber(movement.quantity));
  const entryValueToday = entriesToday.reduce(
    (sum, movement) => sum + movementQuantity(movement) * movementCost(movement),
    0,
  );
  const exitValueToday = exitsToday.reduce(
    (sum, movement) => sum + movementQuantity(movement) * movementCost(movement),
    0,
  );
  const entryQuantityToday = entriesToday.reduce(
    (sum, movement) => sum + movementQuantity(movement),
    0,
  );
  const exitQuantityToday = exitsToday.reduce(
    (sum, movement) => sum + movementQuantity(movement),
    0,
  );

  const chartData = useMemo(() => {
    const periodCount = chartPeriod === "today" ? 24 : 7;
    return Array.from({ length: periodCount }, (_, index) => {
      const dayOffset = chartPeriod === "today" ? 0 : index - 6;
      const day = new Date(`${todayKey}T12:00:00Z`);
      day.setUTCDate(day.getUTCDate() + dayOffset);
      const dayKey = day.toISOString().slice(0, 10);
      const hour = chartPeriod === "today" ? index : undefined;
      const slotMovements = movements.filter((movement) => {
        const time = new Date(movement.created_at);
        return (
          dateKey(time) === dayKey &&
          (hour === undefined ||
            Number(
              new Intl.DateTimeFormat("en-US", {
                timeZone: "America/Santiago",
                hour: "2-digit",
                hourCycle: "h23",
              }).format(time),
            ) === hour)
        );
      });
      const entries = slotMovements.filter((movement) => movement.type === "entrada");
      const exits = slotMovements.filter((movement) => movement.type === "salida");
      const label =
        hour === undefined
          ? new Intl.DateTimeFormat("es-CL", {
              weekday: "short",
              day: "numeric",
            }).format(day)
          : `${String(hour).padStart(2, "0")}:00`;
      return {
        date: hour === undefined ? dayKey : `${dayKey} ${label}`,
        label,
        entradasValue: entries.reduce(
          (sum, movement) =>
            sum +
            finiteNumber(movement.quantity_value, movement.quantity) *
              finiteNumber(movement.unit_cost, finiteNumber(movement.products?.unit_cost)),
          0,
        ),
        salidasValue: exits.reduce(
          (sum, movement) =>
            sum +
            finiteNumber(movement.quantity_value, movement.quantity) *
              finiteNumber(movement.unit_cost, finiteNumber(movement.products?.unit_cost)),
          0,
        ),
        entradasQuantity: entries.reduce(
          (sum, movement) => sum + finiteNumber(movement.quantity_value, movement.quantity),
          0,
        ),
        salidasQuantity: exits.reduce(
          (sum, movement) => sum + finiteNumber(movement.quantity_value, movement.quantity),
          0,
        ),
      };
    });
  }, [chartPeriod, movements, todayKey]);

  const isValueChart = chartMetric === "value";
  const entriesKey = isValueChart ? "entradasValue" : "entradasQuantity";
  const exitsKey = isValueChart ? "salidasValue" : "salidasQuantity";
  const chartValueFormatter = (value: number) =>
    isValueChart ? formatCLP(value) : `${finiteNumber(value).toLocaleString("es-CL")} un.`;
  const hasChartMovements = chartData.some(
    (item) =>
      item.entradasValue > 0 ||
      item.salidasValue > 0 ||
      item.entradasQuantity > 0 ||
      item.salidasQuantity > 0,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Panel</h1>
        <p className="text-sm text-muted-foreground">
          {new Intl.DateTimeFormat("es-CL", {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "America/Santiago",
          }).format(new Date())}
        </p>
      </div>

      <section aria-label="Resumen de hoy" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <span className="text-xs font-medium text-success">Entradas de hoy</span>
          <p className="mt-1 font-display text-xl font-bold">
            {movementsLoading
              ? "Cargando…"
              : movementsError
                ? "No disponible"
                : formatCLP(entriesToday.length === 0 ? 0 : entryValueToday)}
          </p>
          <p className="text-xs text-muted-foreground">
            {movementsError
              ? "No se pudieron cargar los movimientos"
              : `${entryQuantityToday.toLocaleString("es-CL")} cantidad · ${entriesToday.length} movimientos`}
          </p>
        </div>
        <div className="card p-4">
          <span className="text-xs font-medium text-destructive">Salidas de hoy</span>
          <p className="mt-1 font-display text-xl font-bold">
            {movementsLoading
              ? "Cargando…"
              : movementsError
                ? "No disponible"
                : formatCLP(exitsToday.length === 0 ? 0 : exitValueToday)}
          </p>
          <p className="text-xs text-muted-foreground">
            {movementsError
              ? "No se pudieron cargar los movimientos"
              : `${exitQuantityToday.toLocaleString("es-CL")} cantidad · ${exitsToday.length} movimientos`}
          </p>
        </div>
        <div className="card p-4">
          <span className="text-xs font-medium text-muted-foreground">Valor inventario</span>
          <p className="mt-1 font-display text-xl font-bold">
            {productsLoading
              ? "Cargando…"
              : productsError
                ? "No disponible"
                : formatCLP(stockValue)}
          </p>
          <p className="text-xs text-muted-foreground">
            {productsError
              ? "No se pudo cargar el inventario"
              : `${activeProducts.length} productos activos`}
          </p>
        </div>
        <div className="card p-4">
          <span className="text-xs font-medium text-muted-foreground">Stock crítico</span>
          <p className="mt-1 font-display text-xl font-bold text-destructive">
            {productsLoading ? "…" : productsError ? "No disponible" : criticalProducts.length}
          </p>
          <button
            type="button"
            className="text-xs font-medium text-foreground underline underline-offset-2"
            onClick={() => setCriticalOpen(true)}
            disabled={productsLoading || productsError}
          >
            Revisar
          </button>
        </div>
      </section>

      {criticalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setCriticalOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="critical-title"
            className="card flex max-h-[85vh] w-full max-w-3xl flex-col p-5 sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 id="critical-title" className="font-display text-lg font-bold">
                  Stock crítico o sin stock
                </h2>
                <p className="text-sm text-muted-foreground">
                  {criticalProducts.length} productos · {outOfStockCount} sin stock
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost p-1.5"
                aria-label="Cerrar"
                onClick={() => setCriticalOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Descripción</th>
                    <th>Stock</th>
                    <th>Crítico</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCritical.map((product) => {
                    const stock = finiteNumber(product.stock_quantity ?? product.stock);
                    return (
                      <tr key={product.id}>
                        <td className="text-muted-foreground">{product.sku}</td>
                        <td className="font-medium">{product.name}</td>
                        <td>
                          {stock.toLocaleString("es-CL")} {product.unit}
                        </td>
                        <td>
                          {finiteNumber(product.min_stock).toLocaleString("es-CL")} {product.unit}
                        </td>
                        <td>
                          <span
                            className={`badge ${stock <= 0 ? "badge-destructive" : "badge-warning"}`}
                          >
                            {stock <= 0 ? "Sin stock" : "Crítico"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCriticalOpen(false)}
              >
                Cerrar
              </button>
              <Link to="/productos" className="btn btn-primary">
                Ir al inventario
              </Link>
            </div>
          </section>
        </div>
      )}

      <section aria-labelledby="movement-chart-title" className="border-y border-border py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="movement-chart-title" className="font-display text-base font-bold">
            Entradas y salidas
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1" aria-label="Período del gráfico">
              <button
                type="button"
                className={`btn h-8 px-3 text-xs ${chartPeriod === "today" ? "btn-primary" : "btn-ghost"}`}
                aria-pressed={chartPeriod === "today"}
                onClick={() => setChartPeriod("today")}
              >
                Hoy
              </button>
              <button
                type="button"
                className={`btn h-8 px-3 text-xs ${chartPeriod === "7days" ? "btn-primary" : "btn-ghost"}`}
                aria-pressed={chartPeriod === "7days"}
                onClick={() => setChartPeriod("7days")}
              >
                Últimos 7 días
              </button>
            </div>
            <select
              className="input h-8 w-auto py-1 text-xs"
              aria-label="Métrica del gráfico"
              value={chartMetric}
              onChange={(event) => setChartMetric(event.target.value as ChartMetric)}
            >
              <option value="value">Valorización CLP</option>
              <option value="quantity">Cantidad</option>
            </select>
          </div>
        </div>

        {movementsError ? (
          <p className="flex h-60 items-center justify-center text-sm text-destructive">
            No se pudo cargar el gráfico de movimientos.
          </p>
        ) : !movementsLoading && !hasChartMovements ? (
          <p className="flex h-60 items-center justify-center text-sm text-muted-foreground">
            No hay movimientos en el período seleccionado.
          </p>
        ) : (
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  interval={chartPeriod === "today" ? 2 : 0}
                  className="text-xs"
                />
                <YAxis
                  width={78}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={chartValueFormatter}
                  className="text-xs"
                />
                <Tooltip
                  labelFormatter={(label) => String(label)}
                  formatter={(value, name) => [
                    chartValueFormatter(Number(value)),
                    name === "entradas" ? "Entradas" : "Salidas",
                  ]}
                />
                <Bar
                  dataKey={entriesKey}
                  name="entradas"
                  fill="var(--color-success)"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey={exitsKey}
                  name="salidas"
                  fill="var(--color-destructive)"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-2 flex justify-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-success">
            <span className="h-2.5 w-2.5 bg-success" /> Entradas
          </span>
          <span className="flex items-center gap-1.5 text-destructive">
            <span className="h-2.5 w-2.5 bg-destructive" /> Salidas
          </span>
        </div>
      </section>

      <section aria-labelledby="today-movements-title" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="today-movements-title" className="font-display text-base font-bold">
            Movimientos de hoy
          </h2>
          <Link
            to="/movimientos"
            className="text-sm font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Ver movimientos
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="table-base min-w-[620px]">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Descripción</th>
                <th>Documento</th>
                <th>Tipo de unidad</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {movementsLoading ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                    Cargando movimientos…
                  </td>
                </tr>
              ) : movementsError ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-destructive">
                    No se pudieron cargar los movimientos de hoy.
                  </td>
                </tr>
              ) : movementsToday.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                    No hay movimientos hoy.
                  </td>
                </tr>
              ) : (
                movementsToday.map((movement) => {
                  const total = movementQuantity(movement) * movementCost(movement);
                  const documentLabel =
                    movement.document_type === "factura"
                      ? "Factura"
                      : movement.document_type === "guia_despacho"
                        ? "Guía de despacho"
                        : movement.document_type || "Documento";
                  const unitLabel = movement.unit_type
                    ? ({
                        stock: "Stock",
                        arriendo: "Arriendo",
                        nota_venta: "Nota de venta",
                      }[movement.unit_type] ?? movement.unit_type)
                    : movement.measure_unit || movement.products?.unit || "—";
                  return (
                    <tr key={movement.id}>
                      <td className="whitespace-nowrap text-muted-foreground">
                        {new Intl.DateTimeFormat("es-CL", {
                          timeZone: "America/Santiago",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(movement.created_at))}
                      </td>
                      <td className="font-medium">{movement.products?.name ?? "—"}</td>
                      <td>
                        {movement.document_type || movement.document_number ? (
                          <>
                            {documentLabel}
                            {movement.document_number ? ` N.º ${movement.document_number}` : ""}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{unitLabel}</td>
                      <td>{formatCLP(total)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
