import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Download, FileUp, Plus, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES } from "@/lib/warehouse";
import { hasPermission, useAppAccess } from "@/lib/permissions";
import { formatRut, isValidRut } from "@/lib/rut";
import {
  downloadSuppliersWorkbook,
  readSuppliersWorkbook,
  validateSupplierImport,
  type SupplierImportValidation,
} from "@/lib/suppliers-excel";

export const Route = createFileRoute("/_authenticated/contactos")({
  head: () => ({
    meta: [
      { title: "Contactos — BodegaPro" },
      {
        name: "description",
        content: "Gestiona proveedores y nombres maestros asociados a la bodega.",
      },
    ],
  }),
  component: ContactosPage,
});

const EMPTY_FORM = {
  name: "",
  work_area: "",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
  rut: "",
  city: "",
  delivery_address: "",
  notes: "",
};

type Kind = "suppliers" | "customers";
type SupplierImportPreview = SupplierImportValidation & { fileName: string };

function ContactosPage() {
  const access = useAppAccess();
  const canCreate = hasPermission(access?.name, access?.permissions, "contacts", "create");
  const canEdit = hasPermission(access?.name, access?.permissions, "contacts", "edit");
  const canDelete = hasPermission(access?.name, access?.permissions, "contacts", "delete");
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Kind>("suppliers");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [importingSuppliers, setImportingSuppliers] = useState(false);
  const [supplierImportPreview, setSupplierImportPreview] = useState<SupplierImportPreview | null>(
    null,
  );
  const supplierUploadRef = useRef<HTMLInputElement>(null);

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
    work_area?: string | null;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    rut?: string | null;
    city?: string | null;
    delivery_address?: string | null;
    notes: string | null;
  }) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      work_area: row.work_area ?? "",
      contact_name: row.contact_name ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      address: row.address ?? "",
      rut: row.rut ?? "",
      city: row.city ?? "",
      delivery_address: row.delivery_address ?? "",
      notes: row.notes ?? "",
    });
    setFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (tab === "customers") {
        const payload = {
          name: form.name.trim(),
          work_area: form.work_area || null,
        };
        const result = editingId
          ? await supabase.from("customers").update(payload).eq("id", editingId)
          : await supabase.from("customers").insert(payload);
        if (result.error) throw result.error;
      } else {
        if (form.rut.trim() && !isValidRut(form.rut)) {
          toast.error("El RUT no es válido");
          setSaving(false);
          return;
        }
        const payload = {
          name: form.name.trim(),
          rut: form.rut.trim() ? formatRut(form.rut) : null,
          city: form.city.trim() || null,
          delivery_address: form.delivery_address.trim() || null,
          contact_name: form.contact_name || null,
          email: form.email || null,
          phone: form.phone || null,
          address: form.address || null,
          notes: form.notes || null,
        };
        const result = editingId
          ? await supabase.from("suppliers").update(payload).eq("id", editingId)
          : await supabase.from("suppliers").insert(payload);
        if (result.error) throw result.error;
      }

      toast.success("Guardado correctamente");
      setFormOpen(false);
      queryClient.invalidateQueries({ queryKey: [tab] });
    } catch (err) {
      console.error("Error completo al guardar:", err);

      const mensaje = err instanceof Error ? err.message : JSON.stringify(err);

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

  async function handleDownloadSupplierTemplate() {
    setDownloadingTemplate(true);
    try {
      await downloadSuppliersWorkbook();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo crear la plantilla de proveedores",
      );
    } finally {
      setDownloadingTemplate(false);
    }
  }

  async function handleSupplierImport(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setImportingSuppliers(true);
    try {
      const rows = await readSuppliersWorkbook(file);
      const { data: existingSuppliers, error } = await supabase
        .from("suppliers")
        .select("name, rut");
      if (error) throw error;

      const validation = validateSupplierImport(rows, existingSuppliers ?? []);
      setSupplierImportPreview({ ...validation, fileName: file.name });
      if (validation.errors.length > 0) {
        toast.error(`Se encontraron ${validation.errors.length} problemas en la planilla`);
      } else {
        toast.success("Revisa el resumen antes de importar los proveedores.");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo leer la planilla de proveedores",
      );
    } finally {
      input.value = "";
      setImportingSuppliers(false);
    }
  }

  async function confirmSupplierImport() {
    if (!supplierImportPreview || supplierImportPreview.errors.length > 0) return;

    setImportingSuppliers(true);
    try {
      const { data: existingSuppliers, error: fetchError } = await supabase
        .from("suppliers")
        .select("name, rut");
      if (fetchError) throw fetchError;

      const validation = validateSupplierImport(
        supplierImportPreview.rows,
        existingSuppliers ?? [],
      );
      if (validation.errors.length > 0) {
        setSupplierImportPreview({
          ...validation,
          fileName: supplierImportPreview.fileName,
        });
        toast.error(
          "Hay proveedores duplicados o datos inválidos. Corrige la planilla y vuelve a cargarla.",
        );
        return;
      }

      const payload = validation.rows.map(({ rowNumber: _rowNumber, ...supplier }) => ({
        name: supplier.name,
        rut: supplier.rut || null,
        contact_name: supplier.contact_name || null,
        email: supplier.email || null,
        phone: supplier.phone || null,
        address: supplier.address || null,
        city: supplier.city || null,
        delivery_address: supplier.delivery_address || null,
        notes: supplier.notes || null,
      }));
      const { error } = await supabase.from("suppliers").insert(payload);
      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success(`${payload.length} proveedores importados correctamente.`);
      setSupplierImportPreview(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudieron importar los proveedores");
    } finally {
      setImportingSuppliers(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contactos</h1>
          <p className="text-sm text-muted-foreground">
            Proveedores y nombres maestros de la bodega
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tab === "suppliers" && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void handleDownloadSupplierTemplate()}
                disabled={downloadingTemplate || importingSuppliers}
              >
                <Download className="h-4 w-4" />
                {downloadingTemplate ? "Preparando…" : "Plantilla Excel"}
              </button>
              {canCreate && (
                <>
                  <input
                    ref={supplierUploadRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="sr-only"
                    onChange={(e) => void handleSupplierImport(e)}
                    aria-label="Seleccionar planilla Excel de proveedores"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => supplierUploadRef.current?.click()}
                    disabled={
                      importingSuppliers || downloadingTemplate || Boolean(supplierImportPreview)
                    }
                  >
                    <FileUp className="h-4 w-4" />
                    {importingSuppliers ? "Validando…" : "Subir Excel"}
                  </button>
                </>
              )}
            </>
          )}
          {canCreate && (
            <button className="btn btn-primary" onClick={openNew}>
              <Plus className="h-4 w-4" /> Nuevo {tab === "suppliers" ? "proveedor" : "maestro"}
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          className={`btn ${tab === "suppliers" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => {
            setTab("suppliers");
            setSupplierImportPreview(null);
          }}
        >
          Proveedores
        </button>
        <button
          className={`btn ${tab === "customers" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => {
            setTab("customers");
            setSupplierImportPreview(null);
          }}
        >
          Nombre maestro
        </button>
      </div>

      {tab === "suppliers" && supplierImportPreview && (
        <section className="card space-y-3 p-4" aria-labelledby="supplier-import-title">
          <div>
            <h2 id="supplier-import-title" className="font-semibold">
              Revisión de planilla
            </h2>
            <p className="text-sm text-muted-foreground">
              {supplierImportPreview.fileName} · {supplierImportPreview.rows.length} filas de datos
            </p>
          </div>
          {supplierImportPreview.errors.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p>
                Se encontraron {supplierImportPreview.errors.length} problemas. Corrige la planilla
                y vuelve a subirla; no se guardará parcialmente.
              </p>
              <ul className="list-inside list-disc space-y-1">
                {supplierImportPreview.errors.slice(0, 10).map((error, index) => (
                  <li key={`${index}-${error}`}>{error}</li>
                ))}
              </ul>
              {supplierImportPreview.errors.length > 10 && (
                <p>Hay {supplierImportPreview.errors.length - 10} errores adicionales.</p>
              )}
            </div>
          ) : (
            <p className="text-sm">
              Se agregarán {supplierImportPreview.rows.length} proveedores nuevos. Los registros
              existentes no se modificarán.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setSupplierImportPreview(null)}
              disabled={importingSuppliers}
            >
              Descartar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void confirmSupplierImport()}
              disabled={
                importingSuppliers ||
                supplierImportPreview.errors.length > 0 ||
                supplierImportPreview.rows.length === 0
              }
            >
              {importingSuppliers ? "Importando…" : "Importar proveedores"}
            </button>
          </div>
        </section>
      )}

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>{tab === "suppliers" ? "Nombre" : "Nombre maestro"}</th>
              {tab === "suppliers" ? (
                <>
                  <th>RUT</th>
                  <th>Ciudad</th>
                  <th>Contacto</th>
                  <th>Correo</th>
                  <th>Teléfono</th>
                </>
              ) : (
                <th>Área de trabajo</th>
              )}
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td
                  colSpan={tab === "suppliers" ? 7 : 3}
                  className="py-8 text-center text-muted-foreground"
                >
                  Cargando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={tab === "suppliers" ? 7 : 3}
                  className="py-8 text-center text-muted-foreground"
                >
                  No hay {tab === "suppliers" ? "proveedores" : "nombres maestros"} registrados.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.name}</td>
                  {tab === "suppliers" ? (
                    <>
                      <td className="text-muted-foreground">{("rut" in r && r.rut) || "—"}</td>
                      <td className="text-muted-foreground">{("city" in r && r.city) || "—"}</td>
                      <td className="text-muted-foreground">{r.contact_name ?? "—"}</td>
                      <td className="text-muted-foreground">{r.email ?? "—"}</td>
                      <td className="text-muted-foreground">{r.phone ?? "—"}</td>
                    </>
                  ) : (
                    <td className="text-muted-foreground">
                      {("work_area" in r && r.work_area) || "—"}
                    </td>
                  )}
                  <td>
                    <div className="flex gap-1">
                      {canEdit && (
                        <button
                          className="btn btn-ghost p-1.5"
                          onClick={() => openEdit(r)}
                          aria-label="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          className="btn btn-ghost p-1.5 text-destructive"
                          onClick={() => handleDelete(r.id, r.name)}
                          aria-label="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (editingId ? canEdit : canCreate) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-foreground/40 p-4">
          <div className="card w-full max-w-lg p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">
                {editingId ? "Editar" : "Nuevo"} {tab === "suppliers" ? "proveedor" : "maestro"}
              </h2>
              <button
                className="btn btn-ghost p-1.5"
                onClick={() => setFormOpen(false)}
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="label">
                  {tab === "suppliers" ? "Nombre / Razón social *" : "Nombre maestro *"}
                </label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              {tab === "customers" ? (
                <div>
                  <label className="label">Área de trabajo (categoría) *</label>
                  <select
                    className="input"
                    value={form.work_area}
                    onChange={(e) => setForm({ ...form, work_area: e.target.value })}
                    required
                  >
                    <option value="">Selecciona una categoría…</option>
                    {form.work_area &&
                      !CATEGORIES.includes(form.work_area as (typeof CATEGORIES)[number]) && (
                        <option value={form.work_area}>{form.work_area}</option>
                      )}
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
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
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">RUT</label>
                      <input
                        className="input"
                        placeholder="12.345.678-5"
                        value={form.rut}
                        onChange={(e) => setForm({ ...form, rut: e.target.value })}
                        onBlur={() =>
                          form.rut.trim() && setForm({ ...form, rut: formatRut(form.rut) })
                        }
                      />
                    </div>
                    <div>
                      <label className="label">Ciudad</label>
                      <input
                        className="input"
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
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
                    <label className="label">Dirección de despacho</label>
                    <input
                      className="input"
                      value={form.delivery_address}
                      onChange={(e) => setForm({ ...form, delivery_address: e.target.value })}
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
                </>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setFormOpen(false)}
                >
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
