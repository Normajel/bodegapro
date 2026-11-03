import { useQuery } from "@tanstack/react-query";
import { listCompanyAcceptedServices, tenantQueryKeys } from "@/lib/multiempresa/tenant-catalog";

type Props = { companyId: string };

const money = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);

/** Read-only service ledger: deliberately separate from physical stock movements. */
export function TenantServicesLedger({ companyId }: Props) {
  const entries = useQuery({
    queryKey: tenantQueryKeys.acceptedServices(companyId),
    queryFn: () => listCompanyAcceptedServices(companyId),
    enabled: !!companyId,
    staleTime: 0,
  });

  return (
    <section
      aria-label="Servicios aceptados"
      className="mt-6 rounded-lg border border-slate-200 p-4"
    >
      <h2 className="text-lg font-semibold">Servicios aceptados por proveedor</h2>
      <p className="mt-1 text-sm text-slate-600">
        Historial independiente del inventario: la aceptación de servicios nunca suma stock.
      </p>
      {entries.isPending && (
        <p role="status" className="mt-3">
          Consultando servicios…
        </p>
      )}
      {entries.isError && (
        <p role="alert" className="mt-3 text-red-700">
          No se pudo consultar el historial de servicios de esta empresa.
        </p>
      )}
      {entries.isSuccess && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2">Proveedor</th>
                <th className="px-3 py-2">N° OC</th>
                <th className="px-3 py-2">Fecha ingreso</th>
                <th className="px-3 py-2">Fecha aprobación</th>
                <th className="px-3 py-2">Condiciones de pago</th>
                <th className="px-3 py-2">Servicio</th>
                <th className="px-3 py-2">Cantidad</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {entries.data.map((line) => (
                <tr key={line.id} className="border-t">
                  <td className="px-3 py-2">{line.supplier_name}</td>
                  <td className="px-3 py-2">{line.order_number}</td>
                  <td className="px-3 py-2">
                    {new Date(line.entered_at).toLocaleDateString("es-CL")}
                  </td>
                  <td className="px-3 py-2">
                    {line.approved_at
                      ? new Date(line.approved_at).toLocaleDateString("es-CL")
                      : "—"}
                  </td>
                  <td className="px-3 py-2">{line.payment_terms}</td>
                  <td className="px-3 py-2">{line.description}</td>
                  <td className="px-3 py-2">
                    {line.quantity} {line.measure_unit}
                  </td>
                  <td className="px-3 py-2">{money(Number(line.total))}</td>
                  <td className="px-3 py-2 font-semibold text-teal-700">{line.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.data.length === 0 && (
            <p className="p-4 text-sm text-slate-600">
              Todavía no hay órdenes de servicios aceptadas para esta empresa.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
