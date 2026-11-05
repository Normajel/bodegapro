import { useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/lib/multiempresa/company-context";
import { TenantInventoryAdjustmentHistory } from "./TenantInventoryAdjustmentHistory";
import { listCompanyProducts, tenantQueryKeys } from "@/lib/multiempresa/tenant-catalog";

export function TenantInventoryPreview() {
  const companyId = useActiveCompany();

  const inventory = useQuery({
    queryKey: tenantQueryKeys.products(companyId ?? ""),
    queryFn: () => listCompanyProducts(companyId!),
    enabled: !!companyId,
    staleTime: 0,
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Inventario multiempresa</h1>
        <p className="mt-1 text-sm text-slate-600">
          Vista de consulta. Los cambios de stock y las compras siguen bloqueados durante la
          migración.
        </p>
      </header>

      {!companyId && (
        <p role="status">Selecciona una empresa habilitada para consultar su inventario.</p>
      )}
      {companyId && inventory.isPending && <p role="status">Cargando inventario…</p>}
      {companyId && inventory.isError && (
        <p role="alert">No fue posible consultar el inventario de esta empresa.</p>
      )}
      {companyId && inventory.isSuccess && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Unidad</th>
                <th className="px-4 py-3">Stock</th>
              </tr>
            </thead>
            <tbody>
              {inventory.data.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-3">{p.sku}</td>
                  <td className="px-4 py-3">{p.name}</td>
                  <td className="px-4 py-3">{p.category}</td>
                  <td className="px-4 py-3">{p.unit}</td>
                  <td className="px-4 py-3">{p.stock_quantity ?? p.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {inventory.data.length === 0 && (
            <p className="p-6 text-center text-slate-500">
              Esta empresa todavía no tiene productos registrados.
            </p>
          )}
        </div>
      )}
      {companyId && <TenantInventoryAdjustmentHistory companyId={companyId} />}
    </main>
  );
}
