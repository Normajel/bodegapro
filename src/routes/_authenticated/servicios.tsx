import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { hasPermission, useAppAccess } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/servicios")({
  head: () => ({
    meta: [
      { title: "Servicios — BodegaPro" },
      {
        name: "description",
        content: "Consulta y realiza seguimiento de los servicios contratados.",
      },
    ],
  }),
  component: ServiciosPage,
});

type ServiceItem = Tables<"purchase_order_items"> & {
  service_executed_at?: string | null;
};
type ServiceOrder = Tables<"purchase_orders">;

const SERVICE_STATUS_LABELS = {
  por_aprobar: "POR APROBAR",
  aceptado: "ACEPTADO",
  ejecutado: "EJECUTADO",
  anulado: "ANULADO",
} as const;

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-CL");
}

function formatMoney(value: number) {
  return `$ ${value.toLocaleString("es-CL", { maximumFractionDigits: 0 })}`;
}

function ServiciosPage() {
  const access = useAppAccess();
  const canView = hasPermission(access?.name, access?.permissions, "purchases", "view");
  const canEdit = hasPermission(access?.name, access?.permissions, "purchases", "edit");
  const queryClient = useQueryClient();
  const [supplierFilter, setSupplierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  const {
    data: services = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["purchase-order-services"],
    enabled: canView,
    queryFn: async () => {
      const { data: rawItems, error: itemsError } = await supabase
        .from("purchase_order_items")
        .select("*")
        .eq("item_type", "servicio")
        .order("created_at", { ascending: false });
      if (itemsError) throw itemsError;

      const items = rawItems as ServiceItem[];
      if (items.length === 0) return [];
      const orderIds = [...new Set(items.map((item) => item.purchase_order_id))];
      const { data: rawOrders, error: ordersError } = await supabase
        .from("purchase_orders")
        .select("*")
        .in("id", orderIds);
      if (ordersError) throw ordersError;
      const orders = rawOrders as ServiceOrder[];
      const supplierIdsForOrders = [...new Set(orders.map((order) => order.supplier_id))];
      const { data: suppliers, error: suppliersError } = await supabase
        .from("supplier_directory")
        .select("id, name")
        .in("id", supplierIdsForOrders);
      if (suppliersError) throw suppliersError;
      const orderById = new Map(orders.map((order) => [order.id, order]));
      const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
      return items.map((item) => {
        const order = orderById.get(item.purchase_order_id);
        const supplierId = order?.supplier_id;
        const supplier = supplierId ? supplierById.get(supplierId) : undefined;
        const serviceExecutedAt = item.service_executed_at ?? null;
        const serviceStatus =
          order?.status === "anulada"
            ? "anulado"
            : order?.approval_status === "aprobada"
              ? serviceExecutedAt
                ? "ejecutado"
                : "aceptado"
              : "por_aprobar";
        return {
          ...item,
          order,
          supplierName: supplier?.name ?? "—",
          serviceStatus: serviceStatus as keyof typeof SERVICE_STATUS_LABELS,
        };
      });
    },
  });

  async function markAsExecuted(itemId: string) {
    setSavingItemId(itemId);
    try {
      const { error } = await supabase.rpc("mark_purchase_order_service_executed", {
        p_item_id: itemId,
      });
      if (error) throw error;
      toast.success("Servicio marcado como ejecutado");
      await queryClient.invalidateQueries({ queryKey: ["purchase-order-services"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el servicio");
    } finally {
      setSavingItemId(null);
    }
  }

  const filteredServices = services.filter((service) => {
    const matchesSupplier = !supplierFilter || service.supplierName === supplierFilter;
    const matchesStatus = !statusFilter || service.serviceStatus === statusFilter;
    const searchText =
      `${service.supplierName} ${service.order?.order_number ?? ""} ${service.description}`.toLowerCase();
    return matchesSupplier && matchesStatus && searchText.includes(search.trim().toLowerCase());
  });
  const supplierNames = [...new Set(services.map((service) => service.supplierName))].sort();
  const totalContracted = services.reduce((sum, service) => sum + Number(service.quantity), 0);
  const acceptedServices = services.filter(
    (service) => service.serviceStatus === "aceptado",
  ).length;
  const totalAmount = services.reduce((sum, service) => sum + Number(service.line_total), 0);

  if (!canView) {
    return (
      <div className="card p-6 text-sm text-muted-foreground">
        No tienes permiso para consultar los servicios contratados.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Servicios contratados</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Seguimiento independiente de los servicios incluidos en órdenes de compra. No afecta el
          inventario.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-sm text-muted-foreground">Servicios contratados</p>
          <p className="mt-1 text-2xl font-bold">{totalContracted.toLocaleString("es-CL")}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-muted-foreground">Aceptados pendientes de ejecución</p>
          <p className="mt-1 text-2xl font-bold">{acceptedServices.toLocaleString("es-CL")}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-muted-foreground">Monto total</p>
          <p className="mt-1 text-2xl font-bold">{formatMoney(totalAmount)}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="services-search">
            Buscar
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="services-search"
              className="input pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Proveedor, OC o servicio"
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="services-supplier-filter">
            Proveedor
          </label>
          <select
            id="services-supplier-filter"
            className="input"
            value={supplierFilter}
            onChange={(event) => setSupplierFilter(event.target.value)}
          >
            <option value="">Todos los proveedores</option>
            {supplierNames.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="services-status-filter">
            Estado
          </label>
          <select
            id="services-status-filter"
            className="input"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">Todos los estados</option>
            {Object.entries(SERVICE_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base min-w-[1100px]">
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Orden de compra</th>
              <th>Fecha de ingreso</th>
              <th>Fecha de aprobación</th>
              <th>Condiciones de pago</th>
              <th>Servicio</th>
              <th>Cantidad</th>
              <th>Total</th>
              <th>Estado</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-muted-foreground">
                  Cargando servicios…
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-destructive">
                  No se pudieron cargar los servicios.
                </td>
              </tr>
            ) : filteredServices.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-muted-foreground">
                  No hay servicios para mostrar.
                </td>
              </tr>
            ) : (
              filteredServices.map((service) => (
                <tr key={service.id}>
                  <td>{service.supplierName}</td>
                  <td className="font-mono text-sm">{service.order?.order_number ?? "—"}</td>
                  <td className="whitespace-nowrap">
                    {formatDate(service.order?.created_at ?? null)}
                  </td>
                  <td className="whitespace-nowrap">
                    {formatDate(service.order?.approved_at ?? null)}
                  </td>
                  <td>
                    {service.order?.payment_terms_other || service.order?.payment_terms || "—"}
                  </td>
                  <td>{service.description}</td>
                  <td className="whitespace-nowrap">
                    {service.quantity.toLocaleString("es-CL")} {service.measure_unit}
                  </td>
                  <td className="whitespace-nowrap">{formatMoney(Number(service.line_total))}</td>
                  <td>
                    <span
                      className={`badge ${
                        service.serviceStatus === "ejecutado"
                          ? "badge-success"
                          : service.serviceStatus === "aceptado"
                            ? "badge-warning"
                            : "badge-secondary"
                      }`}
                    >
                      {SERVICE_STATUS_LABELS[service.serviceStatus]}
                    </span>
                  </td>
                  <td className="text-right">
                    {canEdit && service.serviceStatus === "aceptado" && (
                      <button
                        type="button"
                        className="btn btn-secondary whitespace-nowrap"
                        disabled={savingItemId === service.id}
                        onClick={() => markAsExecuted(service.id)}
                      >
                        <Check className="h-4 w-4" />
                        {savingItemId === service.id ? "Guardando…" : "Marcar ejecutado"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
