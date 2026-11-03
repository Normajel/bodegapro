import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadMyCompanies } from "@/lib/multiempresa/company-api";
import { listCompanyProducts, tenantQueryKeys } from "@/lib/multiempresa/tenant-catalog";

export function TenantInventoryPreview() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void loadMyCompanies().then((options) => {
      if (!live) return;
      setCompanyId(options.length === 1 ? options[0]?.company.id ?? null : null);
      setReady(true);
    }).catch(() => { if (live) setReady(true); });
    function handleCompanyChanged(event: Event) {
      const selected = (event as CustomEvent<{ companyId?: string }>).detail?.companyId;
      setCompanyId(selected || null);
    }
    window.addEventListener("integrastock:company-changed", handleCompanyChanged);
    return () => { live = false; window.removeEventListener("integrastock:company-changed", handleCompanyChanged); };
  }, []);

  const inventory = useQuery({
    queryKey: tenantQueryKeys.products(companyId ?? ""),
    queryFn: () => listCompanyProducts(companyId!),
    enabled: ready && !!companyId,
    staleTime: 0,
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Inventario multiempresa</h1>
        <p className="mt-1 text-sm text-slate-600">Vista de consulta. Los cambios de stock y las compras siguen bloqueados durante la migración.</p>
      </header>
      {!ready && <p role="status">Verificando empresas autorizadas…</p>}
      {ready && !companyId && <p role="status">Selecciona una empresa habilitada para consultar su inventario.</p>}
      {companyId && inventory.isPending && <p role="status">Cargando inventario…</p>}
      {companyId && inventory.isError && <p role="alert">No fue posible consultar el inventario de esta empresa.</p>}
      {companyId && inventory.isSuccess && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-700"><tr>
              <th className="px-4 py-3">SKU</th><th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">Categoría</th><th className="px-4 py-3">Unidad</th>
              <th className="px-4 py-3">Stock</th>
            </tr></thead>
            <tbody>
              {inventory.data.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-3">{p.sku}</td><td className="px-4 py-3">{p.name}</td>
                  <td className="px-4 py-3">{p.category}</td><td className="px-4 py-3">{p.unit}</td>
                  <td className="px-4 py-3">{p.stock_quantity ?? p.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {inventory.data.length === 0 && <p className="p-6 text-center text-slate-500">Esta empresa todavía no tiene productos registrados.</p>}
        </div>
      )}
    </main>
  );
}
