import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { TenantServicesLedger } from "./TenantServicesLedger";
import { useActiveCompany } from "@/lib/multiempresa/company-context";
import {
  listCompanyMovements,
  listCompanyMovementCancellations,
  listCompanyPurchaseOrders,
  tenantQueryKeys,
} from "@/lib/multiempresa/tenant-catalog";

export function TenantMovementsPreview() {
  const companyId = useActiveCompany();

  const movements = useQuery({
    queryKey: tenantQueryKeys.movements(companyId ?? ""),
    queryFn: () => listCompanyMovements(companyId!),
    enabled: !!companyId,
    staleTime: 0,
  });

  const cancellations = useQuery({
    queryKey: tenantQueryKeys.movementCancellations(companyId ?? ""),
    queryFn: () => listCompanyMovementCancellations(companyId!),
    enabled: !!companyId,
    staleTime: 0,
  });

  const linkedOrders = useQuery({
    queryKey: tenantQueryKeys.orders(companyId ?? ""),
    queryFn: () => listCompanyPurchaseOrders(companyId!),
    enabled: !!companyId,
    staleTime: 0,
  });

  const cancelledByMovement = new Map(
    (cancellations.data ?? []).map((entry) => [entry.movement_id, entry]),
  );

  const orderNumbers = new Map(
    (linkedOrders.data ?? []).map((order) => [order.id, order.order_number]),
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-bold">Movimientos · Multiempresa</h1>
      <p className="mb-3 mt-1 text-sm text-slate-600">
        Últimos 100 movimientos de la empresa. Registro, edición y anulación están deshabilitados
        hasta validar las operaciones de stock.
      </p>
      <p className="mb-6 text-sm text-slate-700">
        Para preparar una entrada vinculada a una OC, utiliza el{" "}
        <Link to="/compras" className="font-semibold text-teal-700 underline">
          módulo Órdenes de compra
        </Link>
        . El registro definitivo será una operación única compartida entre ambos módulos.
      </p>

      {!companyId && <p role="status">Selecciona una empresa.</p>}
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
                <th className="px-4 py-3">Estado / anulación</th>
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
                  <td className="px-4 py-3">
                    {cancelledByMovement.has(m.id) ? (
                      <span className="font-medium text-amber-800" title={cancelledByMovement.get(m.id)?.reason}>
                        ANULADO
                      </span>
                    ) : cancellations.isPending ? (
                      "Verificando…"
                    ) : cancellations.isError ? (
                      "Estado no disponible"
                    ) : (
                      "Vigente"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {movements.data.length === 0 && (
            <p className="p-6 text-center text-slate-600">No hay movimientos para esta empresa.</p>
          )}
        </div>
      )}
      {companyId && cancellations.isSuccess && cancellations.data.length > 0 && (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4" aria-label="Historial de anulaciones">
          <h2 className="font-semibold">Anulaciones de movimientos</h2>
          <p className="mt-1 text-sm text-slate-600">
            Cada anulación conserva su motivo, fecha y responsable; no elimina el movimiento original.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-2">Movimiento</th>
                  <th className="p-2">Tipo original</th>
                  <th className="p-2">Cantidad</th>
                  <th className="p-2">Motivo</th>
                  <th className="p-2">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {cancellations.data.map((entry) => (
                  <tr key={entry.id} className="border-t">
                    <td className="p-2">{entry.movement_id.slice(0, 8)}</td>
                    <td className="p-2">{entry.original_type}</td>
                    <td className="p-2">{entry.quantity}</td>
                    <td className="p-2">{entry.reason}</td>
                    <td className="p-2">{new Date(entry.cancelled_at).toLocaleString("es-CL")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {companyId && <TenantServicesLedger companyId={companyId} />}
    </main>
  );
}
