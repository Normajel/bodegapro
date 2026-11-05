import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveCompany } from "@/lib/multiempresa/company-context";
import { loadMyCompanies } from "@/lib/multiempresa/company-api";
import { listCompanySuppliers, tenantQueryKeys } from "@/lib/multiempresa/tenant-catalog";
import { saveTenantSupplier, type SupplierInput } from "@/lib/multiempresa/supplier-service";

const blank = (): SupplierInput => ({
  name: "",
  supplier_kind: "productos",
  email: "",
  phone: "",
  delivery_days: "",
});
export function TenantSuppliersPreview() {
  const companyId = useActiveCompany();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCompany, setEditingCompany] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierInput>(blank);
  const [notice, setNotice] = useState("");
  const suppliers = useQuery({
    queryKey: tenantQueryKeys.suppliers(companyId ?? ""),
    queryFn: () => listCompanySuppliers(companyId!),
    enabled: !!companyId,
    staleTime: 0,
  });
  const access = useQuery({
    queryKey: ["tenant", companyId ?? "", "supplier-access"],
    queryFn: async () =>
      (await loadMyCompanies()).find((item) => item.company.id === companyId)?.role ?? null,
    enabled: !!companyId,
    staleTime: 0,
  });
  const canWrite = ["ADMIN", "ADMINPRO", "GERENCIA", "GERENTE"].includes(access.data ?? "");
  const save = useMutation({
    mutationFn: async () => {
      if (!companyId || editingCompany !== companyId)
        throw new Error("La empresa cambió. Vuelve a iniciar el formulario.");
      return saveTenantSupplier(companyId, form, editingId ?? undefined);
    },
    onSuccess: async () => {
      setNotice(editingId ? "Proveedor actualizado." : "Proveedor registrado.");
      setEditingId(null);
      setEditingCompany(null);
      setForm(blank());
      if (companyId)
        await queryClient.invalidateQueries({ queryKey: tenantQueryKeys.suppliers(companyId) });
    },
  });
  const start = (supplier?: NonNullable<typeof suppliers.data>[number]) => {
    setEditingCompany(companyId);
    setEditingId(supplier?.id ?? null);
    setForm(
      supplier
        ? {
            name: supplier.name,
            supplier_kind: supplier.supplier_kind as SupplierInput["supplier_kind"],
            email: supplier.email ?? "",
            phone: supplier.phone ?? "",
            delivery_days: supplier.delivery_days == null ? "" : String(supplier.delivery_days),
          }
        : blank(),
    );
    setNotice("");
    save.reset();
  };
  const editOpen = editingCompany === companyId;
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Proveedores y contratistas</h1>
          <p className="mt-1 text-sm text-slate-600">
            Registros exclusivos de la empresa activa. Administración y Gerencia pueden crear o
            modificar.
          </p>
        </div>
        {companyId && canWrite && (
          <button
            type="button"
            onClick={() => start()}
            className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white"
          >
            Nuevo proveedor
          </button>
        )}
      </div>
      {!companyId && <p role="status">Selecciona una empresa habilitada.</p>}
      {companyId && suppliers.isPending && <p role="status">Cargando proveedores…</p>}
      {companyId && suppliers.isError && (
        <p role="alert">No se pudieron consultar los proveedores.</p>
      )}
      {notice && (
        <p role="status" className="mb-3 text-sm text-teal-800">
          {notice}
        </p>
      )}
      {companyId && canWrite && editOpen && (
        <form
          className="mb-6 space-y-3 rounded-xl border bg-white p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!save.isPending) save.mutate();
          }}
        >
          <h2 className="font-bold">{editingId ? "Editar proveedor" : "Nuevo proveedor"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Nombre
              <input
                required
                maxLength={160}
                minLength={2}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded border p-2"
              />
            </label>
            <label className="text-sm font-medium">
              Tipo
              <select
                value={form.supplier_kind}
                onChange={(e) =>
                  setForm({
                    ...form,
                    supplier_kind: e.target.value as SupplierInput["supplier_kind"],
                  })
                }
                className="mt-1 w-full rounded border bg-white p-2"
              >
                <option value="productos">Proveedor de productos</option>
                <option value="servicios">Contratista / Servicios</option>
                <option value="ambos">Ambos</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              Correo
              <input
                type="email"
                maxLength={254}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1 w-full rounded border p-2"
              />
            </label>
            <label className="text-sm font-medium">
              Teléfono
              <input
                maxLength={40}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="mt-1 w-full rounded border p-2"
              />
            </label>
            <label className="text-sm font-medium">
              Plazo de entrega (días)
              <input
                type="number"
                min={0}
                max={3650}
                step={1}
                value={form.delivery_days}
                onChange={(e) => setForm({ ...form, delivery_days: e.target.value })}
                className="mt-1 w-full rounded border p-2"
              />
            </label>
          </div>
          {save.isError && (
            <p role="alert" className="text-sm text-red-700">
              {save.error instanceof Error ? save.error.message : "No se pudo guardar."}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={save.isPending || !companyId || editingCompany !== companyId}
              className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {save.isPending ? "Guardando…" : "Guardar proveedor"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingCompany(null);
                setEditingId(null);
                save.reset();
              }}
              className="rounded border px-4 py-2 text-sm"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      {companyId && suppliers.isSuccess && (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Contacto</th>
                <th className="px-4 py-3">Plazo</th>
                {canWrite && <th className="px-4 py-3">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {suppliers.data.map((supplier) => (
                <tr key={supplier.id} className="border-t">
                  <td className="px-4 py-3">{supplier.name}</td>
                  <td className="px-4 py-3">{supplier.supplier_kind}</td>
                  <td className="px-4 py-3">{supplier.email || supplier.phone || "—"}</td>
                  <td className="px-4 py-3">
                    {supplier.delivery_days == null ? "—" : `${supplier.delivery_days} días`}
                  </td>
                  {canWrite && (
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => start(supplier)}
                        className="text-teal-700 underline"
                      >
                        Editar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {suppliers.data.length === 0 && (
            <p className="p-6 text-center text-slate-500">Sin proveedores registrados.</p>
          )}
        </div>
      )}
    </main>
  );
}
