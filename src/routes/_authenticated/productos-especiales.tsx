import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSpecialProducts } from "@/hooks/use-special-products";
import { SpecialProductModal } from "@/components/special-product-modal";
import { SpecialProductHistory } from "@/components/special-product-history";
import { canAccessSpecialProducts } from "@/lib/special-products";
import { useAppAccess } from "@/lib/permissions";
import { money } from "@/lib/warehouse";
export const Route = createFileRoute("/_authenticated/productos-especiales")({
  component: SpecialProductsPage,
});
function SpecialProductsPage() {
  const access = useAppAccess();
  const { data: products = [], isPending, isError, refetch } = useSpecialProducts();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [page, setPage] = useState(1);
  if (!canAccessSpecialProducts(access?.name))
    return <p>No tienes acceso al inventario especial.</p>;
  const filtered = products.filter((p) =>
    `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(search.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const current = Math.min(page, pages);
  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventario de productos especiales</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo sin stock · Compras y uso en cubicaciones
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          + Ingresar nuevo producto especial
        </button>
      </div>
      <label className="block">
        <span className="sr-only">Buscar producto especial</span>
        <input
          className="input"
          placeholder="Buscar descripción, SKU ESP o categoría…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </label>
      {isPending && <p>Cargando…</p>}
      {isError && (
        <button className="btn btn-secondary" onClick={() => refetch()}>
          No se pudo cargar el catálogo. Reintentar
        </button>
      )}
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Descripción</th>
              <th>Categoría</th>
              <th>Unidad</th>
              <th>Costo de referencia</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice((current - 1) * 20, current * 20).map((p) => (
              <tr key={p.id} className="bg-yellow-100 dark:bg-yellow-950/50">
                <td className="font-semibold">{p.sku}</td>
                <td>{p.name}</td>
                <td>{p.category}</td>
                <td>{p.unit}</td>
                <td>{money(p.unit_cost)}</td>
                <td>
                  <button className="btn btn-secondary" onClick={() => setSelected(p.id)}>
                    Ver compras y uso
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isPending && !isError && !filtered.length && (
          <p className="p-4">No hay productos especiales que coincidan.</p>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          className="btn btn-secondary"
          disabled={current <= 1}
          onClick={() => setPage(current - 1)}
        >
          Anterior
        </button>
        <span>
          {current} / {pages}
        </span>
        <button
          className="btn btn-secondary"
          disabled={current >= pages}
          onClick={() => setPage(current + 1)}
        >
          Siguiente
        </button>
      </div>
      {selected && (
        <section className="card space-y-3 p-4">
          <div className="flex justify-between">
            <h2 className="font-bold">
              {products.find((p) => p.id === selected)?.sku} ·{" "}
              {products.find((p) => p.id === selected)?.name}
            </h2>
            <button className="btn btn-secondary" onClick={() => setSelected("")}>
              Cerrar historial
            </button>
          </div>
          <SpecialProductHistory productId={selected} />
        </section>
      )}
      <SpecialProductModal
        open={open}
        onClose={() => setOpen(false)}
        onSaved={(p) => setSelected(p.id)}
      />
    </main>
  );
}
