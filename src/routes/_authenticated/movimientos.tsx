import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { UNIT_TYPE_LABELS, folioLabel, generarComprobante } from "@/lib/comprobante-pdf";

export const Route = createFileRoute("/_authenticated/movimientos")({
  head: () => ({
    meta: [
      { title: "Movimientos — BodegaPro" },
      { name: "description", content: "Registro de entradas y salidas de stock de la bodega." },
    ],
  }),
  component: MovimientosPage,
});

type FormState = {
  product_id: string;
  type: "entrada" | "salida";
  quantity: number;
  supplier_id: string;
  unit_type: string;
  reference: string;
  notes: string;
};

const emptyForm: FormState = {
  product_id: "",
  type: "entrada",
  quantity: 1,
  supplier_id: "",
  unit_type: "stock",
  reference: "",
  notes: "",
};

function MovimientosPage() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [filterType, setFilterType] = useState<"" | "entrada" | "salida">("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

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
        .limit(500);
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

  const filtered = useMemo(() => {
    return movements.filter((m) => {
      if (filterType && m.type !== filterType) return false;
      const d = new Date(m.created_at);
      if (filterFrom && d < new Date(`${filterFrom}T00:00:00`)) return false;
      if (filterTo && d > new Date(`${filterTo}T23:59:59`)) return false;
      return true;
    });
  }, [movements, filterType, filterFrom, filterTo]);

  type Movement = (typeof movements)[number];

  function printMovement(m: {
    folio: number | null;
    type: "entrada" | "salida";
    created_at: string;
    product_id: string;
    quantity: number;
    unit_type: string | null;
    supplier_id: string | null;
    reference: string | null;
    notes: string | null;
  }) {
    const p = products.find((x) => x.id === m.product_id);
    const fromList = movements.find((x) => x.product_id === m.product_id)?.products;
    generarComprobante({
      folio: m.folio,
      type: m.type,
      created_at: m.created_at,
      product_name: p?.name ?? fromList?.name ?? "—",
      product_sku: p?.sku ?? fromList?.sku ?? "—",
      unit: p?.unit ?? fromList?.unit ?? "",
      quantity: m.quantity,
      unit_type: m.unit_type,
      supplier: suppliers.find((s) => s.id === m.supplier_id)?.name ?? null,
      master_name: m.reference,
      notes: m.notes,
    });
  }

  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(m: Movement) {
    setEditingId(m.id);
    setForm({
      product_id: m.product_id,
      type: m.type,
      quantity: m.quantity,
      supplier_id: m.supplier_id ?? "",
      unit_type: m.unit_type ?? "stock",
      reference: m.reference ?? "",
      notes: m.notes ?? "",
    });
    setFormOpen(true);
  }

  async function save(print: boolean) {
    if (!form.product_id) {
      toast.error("Selecciona un producto");
      return;
    }
    if (!form.quantity || form.quantity < 1) {
      toast.error("La cantidad debe ser mayor a 0");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        product_id: form.product_id,
        type: form.type,
        quantity: form.quantity,
        supplier_id: form.type === "entrada" && form.supplier_id ? form.supplier_id : null,
        customer_id: null,
        unit_type: form.type === "salida" ? form.unit_type : null,
        reference: form.reference || null,
        notes: form.notes || null,
      };
      let saved;
      if (editingId) {
        const { data, error } = await supabase
          .from("stock_movements")
          .update(payload)
          .eq("id", editingId)
          .select()
          .single();
        if (error) throw error;
        saved = data;
        toast.success("Movimiento modificado");
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from("stock_movements")
          .insert({ ...payload, created_by: user?.id ?? null })
          .select()
          .single();
        if (error) throw error;
        saved = data;
        toast.success(
          `${form.type === "entrada" ? "Entrada" : "Salida"} ${folioLabel(data.type, data.folio)} registrada`,
        );
      }
      if (print && saved) printMovement(saved);
      setFormOpen(false);
      setEditingId(null);
      setForm({ ...emptyForm, type: form.type });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
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

  const hasFilters = filterType || filterFrom || filterTo;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Movimientos</h1>
          <p className="text-sm text-muted-foreground">Entradas y salidas de stock</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label">Tipo</label>
            <select
              className="input"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as "" | "entrada" | "salida")}
            >
              <option value="">Todos</option>
              <option value="entrada">Entradas</option>
              <option value="salida">Salidas</option>
            </select>
          </div>
          <div>
            <label className="label">Desde</label>
            <input type="date" className="input" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">Hasta</label>
            <input type="date" className="input" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
          </div>
          {hasFilters && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                setFilterType("");
                setFilterFrom("");
                setFilterTo("");
              }}
            >
              Limpiar
            </button>
          )}
          <button className="btn btn-primary" onClick={openNew}>
            <Plus className="h-4 w-4" /> Registrar movimiento
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>N°</th>
              <th>Fecha</th>
              <th>Producto</th>
              <th>Tipo</th>
              <th>Cantidad</th>
              <th>Proveedor / Tipo de unidad</th>
              <th>Nombre maestro</th>
              <th className="w-28"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted-foreground">
                  Cargando…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted-foreground">
                  {hasFilters ? "No hay movimientos con estos filtros." : "No hay movimientos registrados."}
                </td>
              </tr>
            ) : (
              filtered.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap font-mono text-xs">{folioLabel(m.type, m.folio)}</td>
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
                    {m.type === "salida"
                      ? m.unit_type
                        ? UNIT_TYPE_LABELS[m.unit_type] ?? m.unit_type
                        : m.customers?.name ?? "—"
                      : m.suppliers?.name ?? "—"}
                  </td>
                  <td className="text-muted-foreground">{m.reference ?? "—"}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button className="btn btn-ghost p-1.5" onClick={() => printMovement(m)} aria-label="Imprimir">
                        <Printer className="h-4 w-4" />
                      </button>
                      <button className="btn btn-ghost p-1.5" onClick={() => openEdit(m)} aria-label="Modificar">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="btn btn-ghost p-1.5 text-destructive"
                        onClick={() => handleDelete(m.id)}
                        aria-label="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-foreground/40 p-4">
          <div className="card w-full max-w-md p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">
                {editingId ? "Modificar movimiento" : "Registrar movimiento"}
              </h2>
              <button className="btn btn-ghost p-1.5" onClick={() => setFormOpen(false)} aria-label="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save(false);
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-2">
                {(["entrada", "salida"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={!!editingId}
                    className={`btn ${form.type === t ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setForm({ ...form, type: t })}
                  >
                    {t === "entrada" ? "Entrada" : "Salida"}
                  </button>
                ))}
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
                  <label className="label">Tipo de unidad *</label>
                  <select
                    className="input"
                    value={form.unit_type}
                    onChange={(e) => setForm({ ...form, unit_type: e.target.value })}
                  >
                    {Object.entries(UNIT_TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="label">Nombre maestro</label>
                <input
                  className="input"
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Observaciones</label>
                <textarea
                  className="input"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button type="button" className="btn btn-secondary" onClick={() => setFormOpen(false)}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => save(true)}>
                  <Printer className="h-4 w-4" /> {editingId ? "Guardar e imprimir" : "Registrar e imprimir"}
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
