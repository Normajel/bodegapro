import { TablePagination } from "@/components/table-pagination";
import { PurchaseOrderTracking } from "@/components/purchase-order-tracking";
import { pageWindow, type TablePageSize } from "@/lib/table-pagination";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { hasPermission, canSendPurchaseOrder, useAppAccess } from "@/lib/permissions";
import { deliveryState, deliveryDeadlineLabel } from "@/lib/purchase-delivery";
type Order = Database["public"]["Tables"]["purchase_orders"]["Row"];

export function DeliveryPanel() {
  const access = useAppAccess();
  const enabled = hasPermission(access?.name, access?.permissions, "purchases", "view");
  const canEdit = hasPermission(access?.name, access?.permissions, "purchases", "edit");
  const canSend = canSendPurchaseOrder(access?.name, access?.permissions);
  const [filter, setFilter] = useState("pending");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<TablePageSize>(10);
  const [trackingOrder, setTrackingOrder] = useState<Order | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const {
    data: rows = [],
    isError,
    isLoading,
  } = useQuery({
    queryKey: ["purchase-delivery-summary"],
    enabled,
    refetchInterval: 60000,
    queryFn: async () => {
      const all = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from("purchase_delivery_summary")
          .select("*")
          .gt("product_lines", 0)
          .order("order_number", { ascending: false })
          .range(offset, offset + 999);
        if (error) throw error;
        all.push(...data);
        if (data.length < 1000) return all;
      }
    },
  });
  async function openTracking(id: string) {
    setOpening(id);
    try {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      setTrackingOrder(data);
    } catch {
      toast.error("No se pudo abrir la OC. Intenta nuevamente.");
    } finally {
      setOpening(null);
    }
  }
  if (!enabled) return null;
  const states = rows.map((r) => ({ ...r, delivery: deliveryState(r) }));
  const count = (key: string) => states.filter((r) => r.delivery.key === key).length;
  const untracked = states.filter((r) => ["unsent", "unconfigured"].includes(r.delivery.key));
  const missingDays = untracked.filter((r) => r.delivery_days == null).length;
  const unsent = untracked.filter((r) => !r.sent_at).length;
  const visible = states.filter(
    (r) =>
      filter === "all" ||
      (filter === "pending" && !["complete", "cancelled", "approval"].includes(r.delivery.key)) ||
      (filter === "untracked" && ["unsent", "unconfigured"].includes(r.delivery.key)) ||
      filter === r.delivery.key,
  );
  const pagination = pageWindow(visible.length, pageSize, page);
  const pagedRows = visible.slice(pagination.start, pagination.end);
  const reviewButton = (id: string) => (
    <button
      type="button"
      className="btn btn-secondary text-sm"
      disabled={opening !== null}
      onClick={() => void openTracking(id)}
      aria-label={`Revisar envío y plazo de ${rows.find((r) => r.id === id)?.order_number}`}
    >
      {opening === id ? "Abriendo…" : "Revisar OC"}
    </button>
  );
  return (
    <section className="card min-w-0 space-y-4 p-4" aria-label="Plazos de recepción de productos">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">Recepciones de productos</h2>
          <p className="text-sm text-muted-foreground">
            Plazos en días corridos desde el primer envío registrado: correo confirmado o registro
            manual.
          </p>
        </div>
        <label className="label w-full sm:w-auto">
          Mostrar
          <select
            className="input"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
            }}
          >
            <option value="pending">Pendientes de recepción</option>
            <option value="late">Fuera de plazo</option>
            <option value="soon">Próximas a vencer</option>
            <option value="on_time">Dentro del plazo</option>
            <option value="untracked">Sin seguimiento de plazo</option>
            <option value="unsent">Sin envío registrado</option>
            <option value="unconfigured">Sin plazo configurado</option>
            <option value="approval">Por aprobar</option>
            <option value="complete">Completadas</option>
            <option value="all">Todas</option>
          </select>
        </label>
      </div>
      {isError ? (
        <p role="alert" className="text-destructive">
          No se pudieron consultar los plazos. Intenta recargar la página.
        </p>
      ) : isLoading ? (
        <p role="status">Cargando recepciones…</p>
      ) : (
        <>
          <dl
            className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 xl:grid-cols-6"
            aria-label="Resumen de recepciones"
          >
            {[
              ["En plazo", count("on_time")],
              ["Próximas a vencer", count("soon")],
              ["Vencidas", count("late")],
              ["Sin seguimiento", untracked.length],
              ["Completadas", count("complete")],
              ["Por aprobar", count("approval")],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border bg-muted/40 p-3">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-xl font-bold">{value}</dd>
              </div>
            ))}
          </dl>
          {untracked.length > 0 && (
            <div
              className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm"
              role="status"
            >
              <p className="font-semibold">
                {untracked.length} OC pendientes aún no tienen fecha límite calculable.
              </p>
              <p>
                {unsent} sin envío registrado · {missingDays} sin plazo configurado. Una OC puede
                tener ambos pendientes.
              </p>
              <p>
                Estas órdenes no se cuentan como en plazo ni vencidas. Usa “Revisar OC” para
                configurar el plazo y revisar el envío. Si se envió por otro medio, su fecha no está
                registrada aquí.
              </p>
            </div>
          )}
          {!visible.length ? (
            <p className="py-4 text-sm text-muted-foreground">No hay órdenes en esta situación.</p>
          ) : (
            <>
              <div className="space-y-3 lg:hidden" aria-label="Recepciones en tarjetas">
                {pagedRows.map((r) => (
                  <article key={r.id} className="min-w-0 space-y-3 rounded-lg border p-3">
                    <h3 className="font-semibold">{r.order_number}</h3>
                    <p
                      className={`text-sm font-medium ${r.delivery.late ? "text-destructive" : "text-foreground"}`}
                    >
                      {r.delivery.label}
                    </p>
                    <dl className="space-y-2 text-sm">
                      <div>
                        <dt className="text-muted-foreground">Fecha límite</dt>
                        <dd>{deliveryDeadlineLabel(r)}</dd>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          ["Pedido", r.ordered_quantity],
                          ["Recibido", r.received_quantity],
                          ["Pendiente", r.pending_quantity],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <dt className="text-muted-foreground">{label}</dt>
                            <dd className="font-semibold">{value}</dd>
                          </div>
                        ))}
                      </div>
                    </dl>
                    <p className="text-xs text-muted-foreground">
                      {r.product_lines} líneas de productos. Consulta la OC para ver unidades y
                      detalle.
                    </p>
                    {reviewButton(r.id)}
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto lg:block">
                <table className="table-base">
                  <thead>
                    <tr>
                      {[
                        "OC",
                        "Fecha límite",
                        "Pedido / recibido / pendiente",
                        "Estado",
                        "Acción",
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.order_number}</td>
                        <td>{deliveryDeadlineLabel(r)}</td>
                        <td>
                          {r.ordered_quantity} / {r.received_quantity} / {r.pending_quantity}
                          <small className="block">
                            {r.product_lines} líneas; consulta la OC para sus unidades.
                          </small>
                        </td>
                        <td className={`font-medium ${r.delivery.late ? "text-destructive" : ""}`}>
                          {r.delivery.label}
                        </td>
                        <td>{reviewButton(r.id)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
      {!isError && (
        <TablePagination
          id="panel-deliveries"
          label="Recepciones de productos"
          total={visible.length}
          page={pagination.page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(0);
          }}
          disabled={isLoading}
        />
      )}
      {trackingOrder && (
        <PurchaseOrderTracking
          order={trackingOrder}
          canEdit={canEdit}
          canSend={canSend}
          onClose={() => setTrackingOrder(null)}
        />
      )}
    </section>
  );
}
