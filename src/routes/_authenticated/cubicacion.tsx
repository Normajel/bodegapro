import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/warehouse";

export const Route = createFileRoute("/_authenticated/cubicacion")({
  head: () => ({
    meta: [
      { title: "Cubicación — BodegaPro" },
      {
        name: "description",
        content: "Calcula los materiales necesarios, su costo y lo que falta comprar.",
      },
    ],
  }),
  component: CubicacionPage,
});

type Line = { productId: string; quantity: string };

function CubicacionPage() {
  const [projectName, setProjectName] = useState("");
  const [lines, setLines] = useState<Line[]>([{ productId: "", quantity: "" }]);

  const {
    data: products = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["cubicacion-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, unit, unit_cost, stock_quantity")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const rows = lines.map((line) => {
    const product = productById.get(line.productId);
    const needed = Number(line.quantity.replace(",", ".")) || 0;
    const stock = Number(product?.stock_quantity) || 0;
    const unitCost = Number(product?.unit_cost) || 0;
    return {
      product,
      needed,
      stock,
      missing: Math.max(needed - stock, 0),
      total: needed * unitCost,
      missingCost: Math.max(needed - stock, 0) * unitCost,
    };
  });
  const totalCost = rows.reduce((sum, row) => sum + row.total, 0);
  const totalMissingCost = rows.reduce((sum, row) => sum + row.missingCost, 0);

  const updateLine = (index: number, patch: Partial<Line>) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 px-2 py-4 sm:px-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cubicación</h1>
        <p className="text-sm text-muted-foreground">
          Indica los materiales y cantidades de una obra o trabajo para ver su costo y lo que falta
          comprar según el stock actual.
        </p>
      </div>

      <div className="card space-y-3 p-4">
        <div>
          <label className="label" htmlFor="project-name">
            Obra o trabajo
          </label>
          <input
            id="project-name"
            className="input"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="Ej: Ampliación bodega"
          />
        </div>

        {isError ? (
          <p className="text-sm text-destructive">No se pudieron cargar los productos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base [&_td]:whitespace-nowrap">
              <thead>
                <tr>
                  <th className="min-w-64">Producto</th>
                  <th className="w-28">Cantidad</th>
                  <th>Stock</th>
                  <th>Faltante</th>
                  <th>Costo total</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    <td>
                      <select
                        className="input"
                        aria-label="Producto"
                        value={lines[index]!.productId}
                        disabled={isLoading}
                        onChange={(event) => updateLine(index, { productId: event.target.value })}
                      >
                        <option value="">Selecciona un producto…</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} · {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="input"
                        aria-label="Cantidad"
                        inputMode="decimal"
                        value={lines[index]!.quantity}
                        onChange={(event) => updateLine(index, { quantity: event.target.value })}
                      />
                    </td>
                    <td>
                      {row.product
                        ? `${row.stock.toLocaleString("es-CL")} ${row.product.unit}`
                        : "—"}
                    </td>
                    <td>
                      {row.product ? (
                        <span
                          className={`badge ${row.missing > 0 ? "badge-destructive" : "badge-success"}`}
                        >
                          {row.missing > 0
                            ? `${row.missing.toLocaleString("es-CL")} ${row.product.unit}`
                            : "Completo"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{money(row.total)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost p-1.5 text-destructive"
                        aria-label="Quitar línea"
                        disabled={lines.length === 1}
                        onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setLines((current) => [...current, { productId: "", quantity: "" }])}
        >
          <Plus className="h-4 w-4" /> Agregar material
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-4">
          <span className="text-xs font-medium text-muted-foreground">
            Costo total de materiales
          </span>
          <p className="mt-1 font-display text-xl font-bold">{money(totalCost)}</p>
        </div>
        <div className="card p-4">
          <span className="text-xs font-medium text-muted-foreground">
            Costo de lo que falta comprar
          </span>
          <p className="mt-1 font-display text-xl font-bold text-destructive">
            {money(totalMissingCost)}
          </p>
        </div>
      </div>
    </main>
  );
}
