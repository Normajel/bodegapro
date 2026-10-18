import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/productos")({
  head: () => ({
    meta: [
      { title: "Productos — BodegaPro" },
      {
        name: "description",
        content: "Inventario de productos de la bodega con stock en tiempo real.",
      },
    ],
  }),
  component: ProductosPage,
});

type Product = Tables<"products">;

const DEFAULT_CATEGORY = "Estructura pintura";

const CATEGORIES = [
  DEFAULT_CATEGORY,
  "Carpintería",
  "Gasfitería",
  "Detalle",
  "Artículos eléctricos",
];

const DEFAULT_UNITS = [
  "unidad",
  "kg",
  "rollo",
  "lata",
  "tambor",
  "mt",
  "lts",
  "m²",
  "m³",
  "caja",
  "par",
];

const EMPTY_FORM = {
  sku: "",
  name: "",
  category: CATEGORIES[0] ?? DEFAULT_CATEGORY,
  unit: "unidad",
  supplier_id: "",
  min_stock: 0,
  location: "",
};

function ProductosPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [unitOptions, setUnitOptions] = useState<string[]>(DEFAULT_UNITS);
  const [customUnit, setCustomUnit] = useState("");
  const [addingUnit, setAddingUnit] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel("products-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["products"] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const {
    data: products = [],
    isLoading,
    isError: productsError,
  } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const {
    data: suppliers = [],
    isLoading: suppliersLoading,
    isError: suppliersError,
  } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = products.filter((p) => {
    const term = search.trim().toLowerCase();
    return [p.name, p.sku, p.category].some((value) =>
      (value ?? "").toLowerCase().includes(term),
    );
  });

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setCustomUnit("");
    setAddingUnit(false);
    setFormOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    const savedUnit = p.unit ?? "unidad";
    if (!unitOptions.some((unit) => unit.toLowerCase() === savedUnit.toLowerCase())) {
      setUnitOptions((current) => [...current, savedUnit]);
    }
    setForm({
      sku: p.sku ?? "",
      name: p.name ?? "",
      category: p.category ?? DEFAULT_CATEGORY,
      unit: savedUnit,
      supplier_id: p.supplier_id ?? "",
      min_stock: Number(p.min_stock ?? 0),
      location: p.location ?? "",
    });
    setCustomUnit("");
    setAddingUnit(false);
    setFormOpen(true);
  }

  function addCustomUnit() {
    const value = customUnit.trim();
    if (!value) {
      toast.error("Escribe el nombre de la nueva unidad");
      return;
    }
    const existing = unitOptions.find(
      (unit) => unit.toLowerCase() === value.toLowerCase(),
    );
    if (existing) {
      setForm((current) => ({ ...current, unit: existing }));
    } else {
      setUnitOptions((current) => [...current, value]);
      setForm((current) => ({ ...current, unit: value }));
    }
    setCustomUnit("");
    setAddingUnit(false);
    toast.success("Unidad agregada al selector");
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const sku = form.sku.trim();
    const name = form.name.trim();
    if (!sku || !name) {
      toast.error("Completa el SKU y la descripción");
      return;
    }
    if (form.min_stock < 0) {
      toast.error("El stock mínimo no puede ser negativo");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        sku,
        name,
        category: form.category.trim() || "General",
        unit: form.unit.trim() || "unidad",
        supplier_id: form.supplier_id || null,
        min_stock: Number(form.min_stock),
        location: form.location.trim() || null,
      };

      if (editing) {
        const { error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Producto actualizado con éxito");
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
        toast.success("¡Producto registrado con éxito!");
      }

      setFormOpen(false);
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo guardar el producto",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: Product) {
    if (!confirm(`¿Eliminar "${p.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    setDeletingId(p.id);
    try {
      const { error } = await supabase.from("products").delete().eq("id", p.id);
      if (error) throw error;
      toast.success("Producto eliminado");
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo eliminar el producto",
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Productos</h1>
          <p className="text-sm text-muted-foreground">
            {products.length} productos en inventario
          </p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus className="h-4 w-4" /> Nuevo producto
        </button>
      </div>

      <input
        className="input w-full max-w-sm"
        placeholder="Buscar por nombre, SKU o categoría…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Buscar productos"
      />

      <div className="card overflow-x-auto">
        <table className="table-base w-full">
          <thead>
            <tr>
              <th>Producto</th>
              <th>SKU</th>
              <th>Categoría</th>
              <th>Proveedor</th>
              <th>Ubicación</th>
              <th>Stock</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  Cargando productos…
                </td>
              </tr>
            ) : productsError ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-destructive">
                  No se pudieron cargar los productos. Revisa la conexión con Supabase.
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  No hay productos que coincidan con la búsqueda.
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const supplier = suppliers.find((s) => s.id === p.supplier_id);
                return (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}</td>
                    <td className="text-muted-foreground">{p.sku}</td>
                    <td>
                      <span className="badge badge-muted">{p.category}</span>
                    </td>
                    <td className="text-muted-foreground">
                      {supplier?.name ?? "—"}
                    </td>
                    <td className="text-muted-foreground">{p.location ?? "—"}</td>
                    <td>
                      <span
                        className={`badge ${
                          p.stock === 0
                            ? "badge-destructive"
                            : p.stock <= p.min_stock
                              ? "badge-warning"
                              : "badge-success"
                        }`}
                      >
                        {p.stock} {p.unit}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          className="btn btn-ghost p-1.5"
                          onClick={() => openEdit(p)}
                          aria-label={`Editar ${p.name}`}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className="btn btn-ghost p-1.5 text-destructive"
                          onClick={() => void handleDelete(p)}
                          disabled={deletingId === p.id}
                          aria-label={`Eliminar ${p.name}`}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-foreground/40 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) setFormOpen(false);
          }}
        >
          <section
            className="card my-auto w-full max-w-lg p-5 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-form-title"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="product-form-title" className="font-display text-lg font-bold">
                {editing ? "Editar producto" : "Nuevo producto"}
              </h2>
              <button
                type="button"
                className="btn btn-ghost p-1.5"
                onClick={() => setFormOpen(false)}
                disabled={saving}
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="product-sku">SKU *</label>
                  <input
                    id="product-sku"
                    className="input w-full"
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    required
                    maxLength={80}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="label" htmlFor="product-category">Categoría *</label>
                  <select
                    id="product-category"
                    className="input w-full"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    required
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label" htmlFor="product-name">Descripción *</label>
                <input
                  id="product-name"
                  className="input w-full"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  maxLength={200}
                  placeholder="Ej.: Pintura esmalte al agua blanca"
                />
              </div>

              <div>
                <label className="label" htmlFor="product-supplier">Proveedor</label>
                <select
                  id="product-supplier"
                  className="input w-full"
                  value={form.supplier_id}
                  onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                  disabled={suppliersLoading || suppliersError}
                >
                  <option value="">Sin proveedor</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
                {suppliersError && (
                  <p className="mt-1 text-xs text-destructive">
                    No se pudieron cargar proveedores. Revisa la tabla suppliers.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="product-unit">Unidad de medida *</label>
                  <select
                    id="product-unit"
                    className="input w-full"
                    value={addingUnit ? "__add_new__" : form.unit}
                    onChange={(e) => {
                      if (e.target.value === "__add_new__") {
                        setAddingUnit(true);
                        setCustomUnit("");
                      } else {
                        setAddingUnit(false);
                        setForm({ ...form, unit: e.target.value });
                      }
                    }}
                    required
                  >
                    {unitOptions.map((unit) => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                    <option value="__add_new__">＋ Agregar otra unidad…</option>
                  </select>
                  {addingUnit && (
                    <div className="mt-2 flex gap-2">
                      <input
                        className="input min-w-0 flex-1"
                        value={customUnit}
                        onChange={(e) => setCustomUnit(e.target.value)}
                        placeholder="Nueva unidad"
                        aria-label="Nombre de nueva unidad"
                        autoFocus
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={addCustomUnit}
                      >
                        Agregar
                      </button>
                    </div>
                  )}
                </div>

              </div>

              <div>
                <label className="label" htmlFor="product-min-stock">Stock mínimo</label>
                <input
                  id="product-min-stock"
                  type="number"
                  min={0}
                  step="1"
                  className="input w-full"
                  value={form.min_stock}
                  onChange={(e) => setForm({ ...form, min_stock: Number(e.target.value) })}
                />
              </div>

              <div>
                <label className="label" htmlFor="product-location">Ubicación (opcional)</label>
                <input
                  id="product-location"
                  className="input w-full"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Ej.: Estante A-3"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setFormOpen(false)}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}