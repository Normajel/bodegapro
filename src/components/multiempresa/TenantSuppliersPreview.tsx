import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadMyCompanies } from "@/lib/multiempresa/company-api";
import { listCompanySuppliers, tenantQueryKeys } from "@/lib/multiempresa/tenant-catalog";

export function TenantSuppliersPreview() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void loadMyCompanies().then((options) => {
      if (!live) return;
      setCompanyId(options.length === 1 ? options[0].company.id : null);
      setReady(true);
    }).catch(() => { if (live) setReady(true); });

    const onChange = (event: Event) => {
      const id = (event as CustomEvent<{ companyId?: string }>).detail?.companyId;
      setCompanyId(id || null);
    };
    window.addEventListener("integrastock:company-changed", onChange);
    return () => {
      live = false;
      window.removeEventListener("integrastock:company-changed", onChange);
    };
  }, []);

  const suppliers = useQuery({
    queryKey: tenantQueryKeys.suppliers(companyId ?? ""),
    queryFn: () => listCompanySuppliers(companyId!),
    enabled: ready && !!companyId,
    staleTime: 0,
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-bold">Proveedores multiempresa</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">
        Consulta por empresa. Altas, modificaciones y eliminación se habilitarán después de las pruebas de permisos.
      </p>
      {!ready && <p role="status">Verificando acceso…</p>}
      {ready && !companyId && <p role="status">Selecciona una empresa habilitada.</p>}
      {companyId && suppliers.isPending && <p role="status">Cargando proveedores…</p>}
      {companyId && suppliers.isError && <p role="alert">No se pudieron consultar los proveedores.</p>}
      {companyId && suppliers.isSuccess && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr><th className="px-4 py-3">Proveedor</th><th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Contacto</th><th className="px-4 py-3">Plazo de entrega</th></tr>
            </thead>
            <tbody>
              {suppliers.data.map((supplier) => (
                <tr key={supplier.id} className="border-t">
                  <td className="px-4 py-3">{supplier.name}</td>
                  <td className="px-4 py-3">{supplier.supplier_kind}</td>
                  <td className="px-4 py-3">{supplier.email || supplier.phone || "—"}</td>
                  <td className="px-4 py-3">{supplier.delivery_days == null ? "—" : `${supplier.delivery_days} días`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {suppliers.data.length === 0 && <p className="p-6 text-center text-slate-500">Sin proveedores registrados.</p>}
        </div>
      )}
    </main>
  );
}
