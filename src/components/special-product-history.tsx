import { useSpecialHistory } from "@/hooks/use-special-products";
import { money } from "@/lib/warehouse";
export function SpecialProductHistory({ productId }: { productId: string }) {
  const { data, isPending, isError, refetch } = useSpecialHistory(productId);
  if (isPending) return <p>Cargando historial…</p>;
  if (isError)
    return (
      <button type="button" className="btn btn-secondary" onClick={() => refetch()}>
        No se pudo cargar el historial. Reintentar
      </button>
    );
  return (
    <div className="space-y-4">
      <section>
        <h3 className="font-semibold">Compras recibidas</h3>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Fecha de compra</th>
                <th>Proveedor</th>
                <th>OC</th>
                <th>Documento</th>
                <th>Cantidad</th>
                <th>Costo unitario</th>
                <th>Costo total neto</th>
              </tr>
            </thead>
            <tbody>
              {data.purchases.map((p) => (
                <tr key={p.id} className="bg-yellow-50 dark:bg-yellow-950">
                  <td>{p.purchase_date}</td>
                  <td>{p.supplier_name}</td>
                  <td>{p.order_number}</td>
                  <td>{p.document_number}</td>
                  <td>{p.quantity}</td>
                  <td>{money(p.unit_cost)}</td>
                  <td>{money(p.total_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.purchases.length && (
          <p className="text-sm text-muted-foreground">Sin compras recibidas.</p>
        )}
      </section>
      <section>
        <h3 className="font-semibold">Órdenes de compra asociadas</h3>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Fecha OC</th>
                <th>Proveedor</th>
                <th>OC</th>
                <th>Solicitado</th>
                <th>Recibido</th>
                <th>Unitario</th>
                <th>Total neto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((p) => (
                <tr key={p.id}>
                  <td>{p.purchase_date}</td>
                  <td>{p.supplier_name}</td>
                  <td>{p.order_number}</td>
                  <td>{p.quantity}</td>
                  <td>{p.received_quantity}</td>
                  <td>{money(p.unit_cost)}</td>
                  <td>{money(p.total_cost)}</td>
                  <td>
                    {p.approval_status} · {p.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.orders.length && (
          <p className="text-sm text-muted-foreground">Sin órdenes asociadas.</p>
        )}
      </section>
      <section>
        <h3 className="font-semibold">Uso registrado en cubicaciones</h3>
        <p className="text-xs text-muted-foreground">
          Cantidades de planillas guardadas. No representan salidas de stock ni confirman ejecución.
        </p>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Unidad</th>
                <th>Cliente</th>
                <th>Orden de venta</th>
                <th>Cantidad</th>
                <th>Costo unitario</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.usage.map((u, i) => (
                <tr key={`${u.id}-${i}`}>
                  <td>{new Date(u.created_at).toLocaleDateString("es-CL")}</td>
                  <td>{u.unit_code}</td>
                  <td>{u.context.client}</td>
                  <td>{u.context.salesOrderNumber}</td>
                  <td>{u.quantity}</td>
                  <td>{money(u.unit_cost)}</td>
                  <td>{money(u.total_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.usage.length && <p className="text-sm text-muted-foreground">Sin uso registrado.</p>}
      </section>
    </div>
  );
}
