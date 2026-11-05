import { useQuery } from "@tanstack/react-query";
import { loadMyCompanies } from "@/lib/multiempresa/company-api";
import {
  listCompanyInventoryAdjustments,
  listCompanyInventoryAdjustmentCorrections,
  tenantQueryKeys,
} from "@/lib/multiempresa/tenant-catalog";

/**
 * Company-scoped audit history ported from Contemar.
 * No editing or stock corrections are allowed in this development screen.
 */
export function TenantInventoryAdjustmentHistory({ companyId }: { companyId: string }) {
  const access = useQuery({
    queryKey: ["tenant", companyId, "adjustment-permission"],
    queryFn: async () => {
      const companies = await loadMyCompanies();
      const role = companies.find(({ company }) => company.id === companyId)?.role;
      return role === "ADMIN" || role === "ADMINPRO";
    },
    enabled: !!companyId,
    staleTime: 0,
  });
  const history = useQuery({
    queryKey: tenantQueryKeys.inventoryAdjustments(companyId),
    queryFn: () => listCompanyInventoryAdjustments(companyId),
    enabled: !!companyId && access.data === true,
    staleTime: 0,
  });
  const corrections = useQuery({
    queryKey: tenantQueryKeys.inventoryAdjustmentCorrections(companyId),
    queryFn: () => listCompanyInventoryAdjustmentCorrections(companyId),
    enabled: !!companyId && access.data === true,
    staleTime: 0,
  });
  if (access.isPending) return <p role="status">Verificando permisos de historial…</p>;
  if (!access.data) return null;
  return (
    <section
      className="mt-8 rounded-lg border border-slate-200 bg-white p-4"
      aria-labelledby="tenant-adjustments-title"
    >
      <h2 id="tenant-adjustments-title" className="text-lg font-semibold">
        Historial de ajustes de inventario
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Solo Administración puede consultar los ajustes de esta empresa. La edición y corrección de
        stock todavía están deshabilitadas.
      </p>
      {history.isPending && (
        <p role="status" className="mt-3">
          Consultando historial…
        </p>
      )}
      {history.isError && (
        <p role="alert" className="mt-3 text-red-700">
          No se pudo consultar el historial de ajustes.
        </p>
      )}
      {history.isSuccess && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2">Stock anterior</th>
                <th className="px-3 py-2">Stock corregido</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {history.data.map((entry) => (
                <tr key={entry.id} className="border-t">
                  <td className="px-3 py-2">{entry.description ?? entry.product_id}</td>
                  <td className="px-3 py-2">{entry.initial_stock}</td>
                  <td className="px-3 py-2">{entry.adjusted_stock}</td>
                  <td className="px-3 py-2">
                    {new Date(entry.created_at).toLocaleString("es-CL")}
                  </td>
                  <td className="px-3 py-2">{entry.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.data.length === 0 && (
            <p className="p-4 text-sm text-slate-600">
              No se han registrado ajustes administrativos en esta empresa.
            </p>
          )}
        </div>
      )}
      <div className="mt-5 border-t pt-4">
        <h3 className="font-semibold">Correcciones posteriores de ajustes</h3>
        <p className="mt-1 text-xs text-slate-600">
          El ajuste original nunca se reescribe. Una corrección crea un nuevo evento y actualiza el
          stock actual, sin reproducir movimientos históricos.
        </p>
        {corrections.isPending && (
          <p role="status" className="mt-2">
            Consultando correcciones…
          </p>
        )}
        {corrections.isError && (
          <p role="alert" className="mt-2 text-red-700">
            No se pudieron consultar las correcciones de la empresa.
          </p>
        )}
        {corrections.isSuccess && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-2">Ajuste original</th>
                  <th className="p-2">Stock previo</th>
                  <th className="p-2">Stock corregido</th>
                  <th className="p-2">Motivo</th>
                  <th className="p-2">Fecha / responsable</th>
                </tr>
              </thead>
              <tbody>
                {corrections.data.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="p-2" title={item.original_adjustment_id}>
                      {item.original_adjustment_id.slice(0, 8)}
                    </td>
                    <td className="p-2">{item.previous_stock}</td>
                    <td className="p-2">{item.corrected_stock}</td>
                    <td className="p-2">{item.reason}</td>
                    <td className="p-2">
                      {new Date(item.corrected_at).toLocaleString("es-CL")} ·{" "}
                      {item.corrected_by.slice(0, 8)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!corrections.data.length && (
              <p className="p-3 text-sm text-slate-600">
                No hay correcciones posteriores registradas.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
