import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Package, DollarSign, AlertTriangle, ArrowLeftRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Panel — BodegaPro" },
      { name: "description", content: "Resumen del estado de tu bodega: stock, alertas y movimientos recientes." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("dashboard-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => {
        queryClient.invalidateQueries({ queryKey: ["products"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements" }, () => {
        queryClient.invalidateQueries({ queryKey: ["movements"] });
        queryClient.invalidateQueries({ queryKey: ["products"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*, products(name, sku)")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const activeProducts = products.filter((p) => p.active);
  const stockValue = activeProducts.reduce((sum, p) => sum + p.stock * Number(p.unit_cost), 0);
  const lowStock = activeProducts.filter((p) => p.stock <= p.min_stock);
  const today = new Date().toDateString();
  const movementsToday = movements.filter((m) => new Date(m.created_at).toDateString() === today);

  const stats = [
    { label: "Productos activos", value: activeProducts.length, icon: Package },
    {
      label: "Valor del inventario",
      value: `$${stockValue.toLocaleString("es-CL", { maximumFractionDigits: 0 })}`,
      icon: DollarSign,
    },
    { label: "Alertas de stock bajo", value: lowStock.length, icon: AlertTriangle, warn: lowStock.length > 0 },
    { label: "Movimientos hoy", value: movementsToday.length, icon: ArrowLeftRight },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Panel</h1>
        <p className="text-sm text-muted-foreground">Estado actual de tu bodega</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, warn }) => (
          <div key={label} className="card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
              <Icon className={`h-4 w-4 ${warn ? "text-destructive" : "text-muted-foreground"}`} />
            </div>
            <p className={`mt-2 font-display text-2xl font-bold ${warn ? "text-destructive" : ""}`}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {lowStock.length > 0 && (
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-base font-bold">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Productos con stock bajo
            </h2>
            <Link to="/productos" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Ver todos →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>SKU</th>
                  <th>Stock</th>
                  <th>Mínimo</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}</td>
                    <td className="text-muted-foreground">{p.sku}</td>
                    <td>
                      <span className={`badge ${p.stock === 0 ? "badge-destructive" : "badge-warning"}`}>
                        {p.stock} {p.unit}
                      </span>
                    </td>
                    <td className="text-muted-foreground">{p.min_stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-bold">Movimientos recientes</h2>
          <Link to="/movimientos" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Ver todos →
          </Link>
        </div>
        {movements.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aún no hay movimientos. Registra tu primera entrada o salida.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Tipo</th>
                  <th>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="text-muted-foreground">
                      {new Date(m.created_at).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="font-medium">{m.products?.name ?? "—"}</td>
                    <td>
                      <span className={`badge ${m.type === "entrada" ? "badge-success" : "badge-destructive"}`}>
                        {m.type === "entrada" ? "Entrada" : "Salida"}
                      </span>
                    </td>
                    <td>{m.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
