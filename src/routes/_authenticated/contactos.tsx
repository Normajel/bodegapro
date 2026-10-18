import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/contactos")({
  head: () => ({
    meta: [
      { title: "Contactos — BodegaPro" },
      { name: "description", content: "Proveedores y clientes asociados a los movimientos de bodega." },
    ],
  }),
  component: ContactosPage,
});

const EMPTY_FORM = { name: "", contact_name: "", email: "", phone: "", address: "", notes: "" };

type Kind = "suppliers" | "customers";

function ContactosPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Kind>("suppliers");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: [tab],
    queryFn: async () => {
      const { data, error } = await supabase.from(tab).select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(row: {
    id: string;
    name: string;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    notes: string | null;
  }) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      contact_name: row.contact_name ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      address: row.address ?? "",
      notes: row.notes ?? "",
    });
    setFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        contact_name: form.contact_name || null,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        notes: form.notes || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from(tab)
          .update(payload)
          .eq("id", editingId);

        if (error) {
          console.error("Error al actualizar contacto:", error);
          throw error;
        }
      } else {
        const { error } = await supabase
          .from(tab)
          .insert(payload);

        if (error) {
          console.error("Error al insertar contacto:", error);
          throw error;
        }
      }

      toast.success("Guardado correctamente");
      setFormOpen(false);
      queryClient.invalidateQueries({ queryKey: [tab] });

    } catch (err) {
      console.error("Error completo al guardar:", err);

      const mensaje =
        err instanceof Error ? err.message : JSON.stringify(err);

      toast.error(mensaje || "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Eliminar "${name}"?`)) return;
    const { error } = await supabase.from(tab).delete().eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Eliminado");
      queryClient.invalidateQueries({ queryKey: [tab] });
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contactos</h1>
          <p className="text-sm text-muted-foreground">Proveedores y clientes de la bodega</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus className="h-4 w-4" /> Nuevo {tab === "suppliers" ? "proveedor" : "cliente"}
        </button>
      </div>

      <div className="flex gap-2">
        <button
          className={`btn ${tab === "suppliers" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setTab("suppliers")}
        >
          Proveedores
        </button>
        <button
          className={`btn ${tab === "customers" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setTab("customers")}
        >
          Clientes
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Contacto</th>
              <th>Correo</th>
              <th>Teléfono</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  Cargando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  No hay {tab === "suppliers" ? "proveedores" : "clientes"} registrados.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.name}</td>
                  <td className="text-muted-foreground">{r.contact_name ?? "—"}</td>
                  <td className="text-muted-foreground">{r.email ?? "—"}</td>
                  <td className="text-muted-foreground">{r.phone ?? "—"}</td>
                  <td>
                    <div className="flex gap-1">
                      <button className="btn btn-ghost p-1.5" onClick={() => openEdit(r)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="btn btn-ghost p-1.5 text-destructive"
                        onClick={() => handleDelete(r.id, r.name)}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
          <div className="card w-full max-w-md p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">
                {editingId ? "Editar" : "Nuevo"} {tab === "suppliers" ? "proveedor" : "cliente"}
              </h2>
              <button className="btn btn-ghost p-1.5" onClick={() => setFormOpen(false)} aria-label="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="label">Nombre / Razón social *</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label">Persona de contacto</label>
                <input
                  className="input"
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Correo</label>
                  <input
                    type="email"
                    className="input"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Teléfono</label>
                  <input
                    className="input"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="label">Dirección</label>
                <input
                  className="input"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
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
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
