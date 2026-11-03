import { useQuery } from "@tanstack/react-query";
import {
  listCompanyReceiptLines,
  listCompanyOrderReceipts,
  tenantQueryKeys,
} from "@/lib/multiempresa/tenant-catalog";

type Props = { companyId: string; orderId: string; orderNumber: string };

export function TenantReceiptPreview({ companyId, orderId, orderNumber }: Props) {
  const lines = useQuery({
    queryKey: tenantQueryKeys.receiptLines(companyId, orderId),
    queryFn: () => listCompanyReceiptLines(companyId, orderId),
    enabled: !!companyId && !!orderId,
    staleTime: 0,
  });

  const receipts = useQuery({
    queryKey: tenantQueryKeys.orderReceipts(companyId, orderId),
    queryFn: () => listCompanyOrderReceipts(companyId, orderId),
    enabled: !!companyId && !!orderId,
    staleTime: 0,
  });

  return (
    <section
      className="mt-6 rounded-lg border border-slate-200 p-5"
      aria-label="Recepción de orden de compra"
    >
      <h2 className="text-lg font-semibold">Recepción de OC {orderNumber}</h2>
      <p className="mt-1 text-sm text-slate-600">
        Vista de cantidades pendientes. El registro está deshabilitado hasta completar las pruebas
        con sesiones autenticadas reales.
      </p>
      {lines.isPending && (
        <p className="mt-4" role="status">
          Consultando cantidades pendientes…
        </p>
      )}
      {lines.isError && (
        <p className="mt-4 text-red-700" role="alert">
          No se pudieron consultar las líneas de esta orden.
        </p>
      )}
      {lines.isSuccess && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2">Solicitado</th>
                <th className="px-3 py-2">Recibido</th>
                <th className="px-3 py-2">Pendiente</th>
                <th className="px-3 py-2">Registrar</th>
              </tr>
            </thead>
            <tbody>
              {lines.data.map((line) => (
                <tr className="border-t" key={line.purchase_order_item_id}>
                  <td className="px-3 py-2">{line.description}</td>
                  <td className="px-3 py-2">{line.ordered_quantity}</td>
                  <td className="px-3 py-2">{line.received_quantity}</td>
                  <td className="px-3 py-2">{line.pending_quantity}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled
                      title="Pendiente de habilitación segura"
                      className="cursor-not-allowed rounded bg-slate-200 px-3 py-1 text-slate-500"
                    >
                      Recibir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lines.data.length === 0 && (
            <p className="p-4 text-slate-600">Esta orden no tiene líneas visibles.</p>
          )}
        </div>
      )}

      <div className="mt-6 border-t border-slate-200 pt-4">
        <h3 className="font-semibold">Historial de recepciones vinculadas a esta OC</h3>
        <p className="mt-1 text-xs text-slate-600">
          Cada recepción corresponde a un movimiento de entrada del inventario de esta empresa.
        </p>
        {receipts.isPending && <p role="status">Consultando movimientos asociados…</p>}
        {receipts.isError && (
          <p role="alert">No se pudo consultar el historial de recepciones.</p>
        )}
        {receipts.isSuccess && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2">Folio</th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Recibido</th>
                  <th className="px-3 py-2">Referencia</th>
                </tr>
              </thead>
              <tbody>
                {receipts.data.map((entry) => (
                  <tr key={entry.id} className="border-t">
                    <td className="px-3 py-2">{entry.folio}</td>
                    <td className="px-3 py-2">
                      {new Date(entry.created_at).toLocaleDateString("es-CL")}
                    </td>
                    <td className="px-3 py-2">
                      {lines.data?.find((line) => line.purchase_order_item_id === entry.purchase_order_item_id)?.description ?? "Producto vinculado"}
                    </td>
                    <td className="px-3 py-2">{entry.quantity}</td>
                    <td className="px-3 py-2">
                      {entry.reference ?? entry.document_number ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {receipts.data.length === 0 && (
              <p className="p-4 text-sm text-slate-600">
                Todavía no hay recepciones registradas para esta OC.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
