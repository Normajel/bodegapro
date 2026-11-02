import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadMyCompanies } from "@/lib/multiempresa/company-api";
import { listCompanyPurchaseOrders, tenantQueryKeys } from "@/lib/multiempresa/tenant-catalog";

const clp = (n: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

export function TenantOrdersPreview() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const onCompanyChange = (event: Event) => {
      const id = (event as CustomEvent<{companyId?: string}>).detail?.companyId;
      setCompanyId(id || null);
    };
    window.addEventListener("integrastock:company-changed", onCompanyChange);
    void loadMyCompanies().then(options => {
      if (!mounted) return;
      setCompanyId(current => current ?? (options.length === 1 ? options[0].company.id : null));
      setReady(true);
    }).catch(() => { if (mounted) setReady(true); });
    return () => { mounted = false; window.removeEventListener("integrastock:company-changed", onCompanyChange); };
  }, []);

  const orders = useQuery({
    queryKey: tenantQueryKeys.orders(companyId ?? ""),
    queryFn: () => listCompanyPurchaseOrders(companyId!),
    enabled: ready && !!companyId,
    staleTime: 0,
  });

  return <main className="mx-auto max-w-7xl px-4 py-8">
    <h1 className="text-2xl font-bold">Órdenes de compra · Multiempresa</h1>
    <p className="mb-6 mt-1 text-sm text-slate-600">Historial de solo lectura. Aprobación, recepción y edición permanecen bloqueadas.</p>
    {!ready && <p role="status">Verificando empresas…</p>}
    {ready && !companyId && <p role="status">Selecciona una empresa para ver sus órdenes.</p>}
    {companyId && orders.isPending && <p role="status">Cargando órdenes…</p>}
    {companyId && orders.isError && <p role="alert">No se pudieron consultar las órdenes de esta empresa.</p>}
    {companyId && orders.isSuccess && <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50"><tr>
          <th className="px-4 py-3">N° OC</th><th className="px-4 py-3">Fecha</th>
          <th className="px-4 py-3">Aprobación</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Total</th>
        </tr></thead>
        <tbody>{orders.data.map(order => <tr className="border-t" key={order.id}>
          <td className="px-4 py-3">{order.order_number}</td>
          <td className="px-4 py-3">{order.order_date ?? "—"}</td>
          <td className="px-4 py-3">{order.approval_status}</td>
          <td className="px-4 py-3">{order.status}</td>
          <td className="px-4 py-3">{clp(Number(order.total_amount ?? 0))}</td>
        </tr>)}</tbody>
      </table>
      {orders.data.length === 0 && <p className="p-6 text-center text-slate-600">No existen órdenes de compra para esta empresa.</p>}
    </div>}
  </main>;
}
