import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/movimientos")({
  head: () => ({
    meta: [
      { title: "Movimientos — BodegaPro" },
      { name: "description", content: "Registro de entradas y salidas de stock de la bodega." },
    ],
  }),
  component: MovimientosPage,
});

function MovimientosPage() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    product_id: "",
    type: "entrada" as "entrada" | "salida",
    quantity: 1,
    supplier_id: "",
    customer_id: "",
    reference: "",
    notes: "",
  });

  useEffect(() => {
    const channel = supabase
      .channel("movements-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements" }, () => {
        queryClient.invalidateQueries({ queryKey: ["movements"] });
        queryClient.invalidateQueries({ queryKey: ["products"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*, products(name, sku, unit), suppliers(name), customers(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, stock, unit")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("stock_movements").insert({
        product_id: form.product_id,
        type: form.type,
        quantity: form.quantity,
        supplier_id: form.type === "entrada" && form.supplier_id ? form.supplier_id : null,
        customer_id: form.type === "salida" && form.customer_id ? form.customer_id : null,
        reference: form.reference || null,
        notes: form.notes || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      toast.success(`${form.type === "entrada" ? "Entrada" : "Salida"} registrada`);
      setFormOpen(false);
      setForm({ ...form, quantity: 1, reference: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al registrar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este movimiento? El stock se revertirá.")) return;
    const { error } = await supabase.from("stock_movements").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Movimiento eliminado y stock revertido");
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Movimientos</h1>
          <p className="text-sm text-muted-foreground">Entradas y salidas de stock</p>
        </div>
        <button className="btn btn-primary" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> Registrar movimiento
        </button>
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
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  Cargando…
                </td>
              </tr>
            ) : movements.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  No hay movimientos registrados.
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
                  <td>
                    {m.quantity} {m.products?.unit ?? ""}
                  </td>
                  <td className="text-muted-foreground">
                    {m.suppliers?.name ?? m.customers?.name ?? "—"}
                  </td>
                  <td className="text-muted-foreground">{m.reference ?? "—"}</td>
                  <td>
                    <button
                      className="btn btn-ghost p-1.5 text-destructive"
                      onClick={() => handleDelete(m.id)}
                      aria-label="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
          <div className="card w-full max-w-md p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Registrar movimiento</h2>
              <button className="btn btn-ghost p-1.5" onClick={() => setFormOpen(false)} aria-label="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`btn ${form.type === "entrada" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setForm({ ...form, type: "entrada" })}
                >
                  Entrada
                </button>
                <button
                  type="button"
                  className={`btn ${form.type === "salida" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setForm({ ...form, type: "salida" })}
                >
                  Salida
                </button>
              </div>
              <div>
                <label className="label">Producto *</label>
                <select
                  className="input"
                  value={form.product_id}
                  onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                  required
                >
                  <option value="">Selecciona un producto…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku}) — stock: {p.stock}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Cantidad *</label>
                <input
                  type="number"
                  min={1}
                  className="input"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                  required
                />
              </div>
              {form.type === "entrada" ? (
                <div>
                  <label className="label">Proveedor</label>
                  <select
                    className="input"
                    value={form.supplier_id}
                    onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                  >
                    <option value="">Sin proveedor</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="label">Cliente</label>
                  <select
                    className="input"
                    value={form.customer_id}
                    onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                  >
                    <option value="">Sin cliente</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="label">Referencia</label>
                <input
                  className="input"
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                  placeholder="Ej: Orden de compra #123"
                />
              </div>
              <div>
                <label className="label">Notas</label>
                <textarea
                  className="input"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn btn-secondary" onClick={() => setFormOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Guardando…" : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
