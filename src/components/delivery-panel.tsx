import { TablePagination } from "@/components/table-pagination";
import { pageWindow, type TablePageSize } from "@/lib/table-pagination";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { hasPermission, useAppAccess } from "@/lib/permissions";
import { deliveryState, displayDate } from "@/lib/purchase-delivery";
export function DeliveryPanel() {
  const access = useAppAccess();
  const enabled = hasPermission(access?.name, access?.permissions, "purchases", "view");
  const [filter, setFilter] = useState("pending");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<TablePageSize>(10);
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
  if (!enabled) return null;
  const states = rows.map((r) => ({ ...r, delivery: deliveryState(r) }));
  const late = states.filter((r) => r.delivery.key === "late").length;
  const upcoming = states.filter((r) => r.delivery.key === "soon").length;
  const inTime = states.filter((r) => r.delivery.key === "on_time").length;
  const visible = states.filter(
    (r) =>
      filter === "all" ||
      (filter === "pending" && !["complete", "cancelled", "approval"].includes(r.delivery.key)) ||
      filter === r.delivery.key,
  );
  const pagination = pageWindow(visible.length, pageSize, page);
  const pagedRows = visible.slice(pagination.start, pagination.end);
  return (
    <section className="card space-y-3 p-4" aria-label="Plazos de recepción de productos">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Recepciones de productos</h2>
          <p className="text-sm text-muted-foreground">
            {inTime} en plazo · {upcoming} próximas a vencer ·{" "}
            <span className="font-semibold text-destructive">{late} vencidas</span>. Días corridos
            desde el primer envío exitoso.
          </p>
        </div>
        <label className="label">
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
            <option value="unsent">Sin enviar</option>
            <option value="complete">Completadas</option>
            <option value="all">Todas</option>
          </select>
        </label>
      </div>
      {isError ? (
        <p role="alert" className="text-destructive">
          No se pudieron consultar los plazos.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                {["OC", "Fecha límite", "Pedido / recibido / pendiente", "Estado"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4}>Cargando…</td>
                </tr>
              ) : !visible.length ? (
                <tr>
                  <td colSpan={4}>No hay órdenes en esta situación.</td>
                </tr>
              ) : (
                pagedRows.map((r) => (
                  <tr
                    key={r.id}
                    className={r.delivery.late ? "bg-destructive/5 text-destructive" : ""}
                  >
                    <td>{r.order_number}</td>
                    <td>{displayDate(r.due_date)}</td>
                    <td>
                      {r.ordered_quantity} / {r.received_quantity} / {r.pending_quantity}
                      <small className="block">
                        Totales de cantidades de {r.product_lines} líneas; consultar la OC para sus
                        unidades.
                      </small>
                    </td>
                    <td className="font-medium">{r.delivery.label}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
    </section>
  );
}
