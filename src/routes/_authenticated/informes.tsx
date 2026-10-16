import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/informes")({
  head: () => ({
    meta: [
      { title: "Informes — BodegaPro" },
      { name: "description", content: "Hoja de informe de movimientos e inventario de la bodega, exportable a CSV." },
    ],
  }),
  component: InformesPage,
});

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function InformesPage() {
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);
  const [from, setFrom] = useState(toISODate(monthAgo));
  const [to, setTo] = useState(toISODate(today));

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["report-movements", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*, products(name, sku, unit, unit_cost), suppliers(name), customers(name)")
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const summary = useMemo(() => {
    const entradas = movements.filter((m) => m.type === "entrada");
    const salidas = movements.filter((m) => m.type === "salida");
    const unitsIn = entradas.reduce((s, m) => s + m.quantity, 0);
    const unitsOut = salidas.reduce((s, m) => s + m.quantity, 0);
    const stockValue = products.reduce((s, p) => s + p.stock * Number(p.unit_cost), 0);
    return {
      totalMovements: movements.length,
      entradas: entradas.length,
      salidas: salidas.length,
      unitsIn,
      unitsOut,
      stockValue,
    };
  }, [movements, products]);

  function exportCSV() {
    const header = "Fecha,Producto,SKU,Tipo,Cantidad,Proveedor/Cliente,Referencia,Notas";
    const lines = movements.map((m) =>
      [
        new Date(m.created_at).toLocaleString("es-CL"),
        `"${m.products?.name ?? ""}"`,
        m.products?.sku ?? "",
        m.type,
        m.quantity,
        `"${m.suppliers?.name ?? m.customers?.name ?? ""}"`,
        `"${m.reference ?? ""}"`,
        `"${(m.notes ?? "").replaceAll('"', '""')}"`,
      ].join(",")
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `informe-bodega-${from}_a_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Informes</h1>
          <p className="text-sm text-muted-foreground">Hoja de informe de movimientos e inventario</p>
        </div>
        <button className="btn btn-primary" onClick={exportCSV} disabled={movements.length === 0}>
          <Download className="h-4 w-4" /> Exportar CSV
        </button>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">Desde</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <span className="text-xs font-medium text-muted-foreground">Movimientos</span>
          <p className="mt-1 font-display text-2xl font-bold">{summary.totalMovements}</p>
        </div>
        <div className="card p-4">
          <span className="text-xs font-medium text-muted-foreground">Unidades ingresadas</span>
          <p className="mt-1 font-display text-2xl font-bold text-success">{summary.unitsIn}</p>
        </div>
        <div className="card p-4">
          <span className="text-xs font-medium text-muted-foreground">Unidades despachadas</span>
          <p className="mt-1 font-display text-2xl font-bold text-destructive">{summary.unitsOut}</p>
        </div>
        <div className="card p-4">
          <span className="text-xs font-medium text-muted-foreground">Valor inventario actual</span>
          <p className="mt-1 font-display text-2xl font-bold">
            ${summary.stockValue.toLocaleString("es-CL", { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Producto</th>
              <th>Tipo</th>
              <th>Cantidad</th>
              <th>Proveedor / Cliente</th>
              <th>Referencia</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  Cargando…
                </td>
              </tr>
            ) : movements.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  No hay movimientos en este período.
                </td>
              </tr>
            ) : (
              movements.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap text-muted-foreground">
                    {new Date(m.created_at).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="font-medium">{m.products?.name ?? "—"}</td>
                  <td>
                    <span className={`badge ${m.type === "entrada" ? "badge-success" : "badge-destructive"}`}>
                      {m.type === "entrada" ? "Entrada" : "Salida"}
                    </span>
                  </td>
                  <td>{m.quantity}</td>
                  <td className="text-muted-foreground">{m.suppliers?.name ?? m.customers?.name ?? "—"}</td>
                  <td className="text-muted-foreground">{m.reference ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
