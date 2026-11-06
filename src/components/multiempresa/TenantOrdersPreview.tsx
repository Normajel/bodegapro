import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TenantReceiptPreview } from "./TenantReceiptPreview";
import { TenantServicesLedger } from "./TenantServicesLedger";
import { TenantNewOrderDraft } from "./TenantNewOrderDraft";
import { useActiveCompany } from "@/lib/multiempresa/company-context";
import { loadMyCompanies } from "@/lib/multiempresa/company-api";
import {
  canApproveTenantOrder,
  PURCHASE_APPROVAL_WRITES_ENABLED,
  approveTenantOrder,
} from "@/lib/multiempresa/approval-service";
import { listCompanyPurchaseOrders, tenantQueryKeys } from "@/lib/multiempresa/tenant-catalog";

const clp = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);

export function TenantOrdersPreview() {
  const companyId = useActiveCompany();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const approve = useMutation({
    mutationFn: (orderId: string) => {
      if (!companyId) throw new Error("Debes seleccionar una empresa.");
      return approveTenantOrder(companyId, orderId, queryClient);
    },
  });

  const orders = useQuery({
    queryKey: tenantQueryKeys.orders(companyId ?? ""),
    queryFn: () => listCompanyPurchaseOrders(companyId!),
    enabled: !!companyId,
    staleTime: 0,
  });

  const membership = useQuery({
    queryKey: ["tenant", companyId ?? "", "approval-permission"],
    queryFn: async () => {
      const options = await loadMyCompanies();
      return options.find(({ company }) => company.id === companyId)?.role ?? null;
    },
    enabled: !!companyId,
    staleTime: 0,
  });
  const mayApprove = canApproveTenantOrder(membership.data);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-bold">Órdenes de compra · Multiempresa</h1>
      <p className="mb-6 mt-1 text-sm text-slate-600">
        Creación y aprobación de órdenes de productos, separadas por empresa. La recepción se
        registra únicamente después de la aprobación. Los servicios se procesarán por su flujo
        independiente.
      </p>

      {companyId && <TenantNewOrderDraft key={companyId} companyId={companyId} />}
      {approve.isError && (
        <p role="alert" className="mb-4 rounded border border-red-200 p-3 text-sm text-red-800">
          {approve.error instanceof Error
            ? approve.error.message
            : "No se pudo aprobar esta orden."}
        </p>
      )}
      {approve.isSuccess && (
        <p role="status" className="mb-4 rounded bg-teal-50 p-3 text-sm text-teal-900">
          OC de productos aprobada correctamente.
        </p>
      )}
      {!companyId && <p role="status">Selecciona una empresa para ver sus órdenes.</p>}
      {companyId && orders.isPending && <p role="status">Cargando órdenes…</p>}
      {companyId && orders.isError && (
        <p role="alert">No se pudieron consultar las órdenes de esta empresa.</p>
      )}
      {companyId && orders.isSuccess && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3">N° OC</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Aprobación</th>
                <th className="px-4 py-3">Fecha aprobación</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Recepción</th>
                {mayApprove && <th className="px-4 py-3">Acción Gerencia</th>}
              </tr>
            </thead>
            <tbody>
              {orders.data.map((order) => (
                <tr className="border-t" key={order.id}>
                  <td className="px-4 py-3">{order.order_number}</td>
                  <td className="px-4 py-3">{order.order_date ?? "—"}</td>
                  <td className="px-4 py-3">{order.order_kind ?? "—"}</td>
                  <td className="px-4 py-3">{order.approval_status}</td>
                  <td className="px-4 py-3">
                    {order.approved_at
                      ? new Date(order.approved_at).toLocaleDateString("es-CL")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">{order.status}</td>
                  <td className="px-4 py-3">{clp(Number(order.total_amount ?? 0))}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="rounded border px-3 py-1"
                      onClick={() =>
                        setSelectedOrderId(order.id === selectedOrderId ? null : order.id)
                      }
                    >
                      {selectedOrderId === order.id
                        ? "Ocultar"
                        : order.order_kind === "servicio"
                          ? "Ver servicios"
                          : "Ver pendientes"}
                    </button>
                  </td>
                  {mayApprove && (
                    <td className="px-4 py-3">
                      {order.approval_status === "por_aprobar" && order.status === "pendiente" ? (
                        <button
                          type="button"
                          disabled={
                            !PURCHASE_APPROVAL_WRITES_ENABLED ||
                            order.order_kind !== "producto" ||
                            approve.isPending
                          }
                          onClick={() => {
                            if (order.order_kind === "producto" && !approve.isPending)
                              approve.mutate(order.id);
                          }}
                          title={
                            order.order_kind === "servicio"
                              ? "La aceptación de servicios tiene un flujo independiente aún no habilitado"
                              : "Aprobar orden de productos"
                          }
                          className="rounded bg-teal-700 px-3 py-1 text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-600"
                        >
                          {approve.isPending && approve.variables === order.id
                            ? "Aprobando…"
                            : order.order_kind === "servicio"
                              ? "Aceptar servicios (pendiente)"
                              : "Aprobar OC"}
                        </button>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {orders.data.length === 0 && (
            <p className="p-6 text-center text-slate-600">
              No existen órdenes de compra para esta empresa.
            </p>
          )}
        </div>
      )}
      {companyId &&
        orders.isSuccess &&
        orders.data
          .filter(
            (o) =>
              o.id === selectedOrderId &&
              o.approval_status === "aprobada" &&
              o.status !== "ACEPTADO" &&
              o.order_kind === "producto",
          )
          .map((o) => (
            <TenantReceiptPreview
              key={o.id}
              companyId={companyId}
              orderId={o.id}
              orderNumber={o.order_number}
            />
          ))}
      {companyId && <TenantServicesLedger companyId={companyId} />}
      {companyId &&
        orders.isSuccess &&
        orders.data.some(
          (o) => o.id === selectedOrderId && o.order_kind === "servicio" && o.status !== "ACEPTADO",
        ) && (
          <p className="mt-4 text-amber-800">
            Orden de servicios pendiente de aceptación por Gerencia. No corresponde recibir
            productos físicos.
          </p>
        )}
      {companyId &&
        orders.isSuccess &&
        orders.data.some((o) => o.id === selectedOrderId && o.status === "ACEPTADO") && (
          <p className="mt-4 text-teal-800">
            Esta OC corresponde a servicios ACEPTADOS. Consulta su detalle en el historial de
            servicios; no tiene recepción física de inventario.
          </p>
        )}
      {companyId &&
        orders.isSuccess &&
        orders.data.some(
          (o) =>
            o.id === selectedOrderId &&
            o.approval_status !== "aprobada" &&
            o.order_kind === "producto",
        ) && (
          <p className="mt-4 text-amber-800">
            La orden debe estar aprobada para consultar su recepción.
          </p>
        )}
    </main>
  );
}
