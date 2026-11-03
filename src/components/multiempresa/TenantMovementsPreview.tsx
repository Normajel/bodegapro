import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadMyCompanies } from "@/lib/multiempresa/company-api";
import {
  listCompanyMovements,
  listCompanyPurchaseOrders,
  tenantQueryKeys,
} from "@/lib/multiempresa/tenant-catalog";

export function TenantMovementsPreview() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    function changed(event: Event) {
      const id = (event as CustomEvent<{ companyId?: string }>).detail?.companyId;
      setCompanyId(id || null);
    }
    window.addEventListener("integrastock:company-changed", changed);
    void loadMyCompanies()
      .then((options) => {
        if (!mounted) return;
        setCompanyId(
          (previous) =>
            previous ?? (options.length === 1 ? (options[0]?.company.id ?? null) : null),
        );
        setReady(true);
      })
      .catch(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
      window.removeEventListener("integrastock:company-changed", changed);
    };
  }, []);

  const movements = useQuery({
    queryKey: tenantQueryKeys.movements(companyId ?? ""),
    queryFn: () => listCompanyMovements(companyId!),
    enabled: ready && !!companyId,
    staleTime: 0,
  });

  const linkedOrders = useQuery({
    queryKey: tenantQueryKeys.orders(companyId ?? ""),
    queryFn: () => listCompanyPurchaseOrders(companyId!),
    enabled: ready && !!companyId,
    staleTime: 0,
  });

  const orderNumbers = new Map(
    (linkedOrders.data ?? []).map((order) => [order.id, order.order_number]),
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-bold">Movimientos · Multiempresa</h1>
      <p className="mb-6 mt-1 text-sm text-slate-600">
        Últimos 100 movimientos de la empresa. Registro, edición y anulación están deshabilitados
        hasta validar las operaciones de stock.
      </p>
      {!ready && <p role="status">Verificando empresas…</p>}
      {ready && !companyId && <p role="status">Selecciona una empresa.</p>}
      {companyId && movements.isPending && <p role="status">Cargando movimientos…</p>}
      {companyId && movements.isError && (
        <p role="alert">No se pudieron consultar los movimientos.</p>
      )}
      {companyId && movements.isSuccess && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Cantidad</th>
                <th className="px-4 py-3">Origen / OC</th>
                  <th className="px-4 py-3">Referencia</th>
              </tr>
            </thead>
            <tbody>
              {movements.data.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="px-4 py-3">{m.folio ?? "—"}</td>
                  <td className="px-4 py-3">
                    {new Date(m.created_at).toLocaleDateString("es-CL")}
                  </td>
                  <td className="px-4 py-3">{m.type}</td>
                  <td className="px-4 py-3">
                    {m.quantity} {m.measure_unit ?? ""}
                  </td>
                  <td className="px-4 py-3">
                    {m.purchase_order_id
                      ? `OC ${orderNumbers.get(m.purchase_order_id) ?? m.purchase_order_id}`
                      : "Sin OC vinculada"}
                  </td>
                  <td className="px-4 py-3">{m.reference ?? m.document_number ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {movements.data.length === 0 && (
            <p className="p-6 text-center text-slate-600">No hay movimientos para esta empresa.</p>
          )}
        </div>
      )}
    </main>
  );
}
