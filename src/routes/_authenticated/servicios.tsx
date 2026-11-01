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

type ServiceItem = Tables<"purchase_order_items"> & { service_executed_at?: string | null };
type ServiceOrder = Tables<"purchase_orders">;

const STATUS_LABELS = {
  por_aprobar: "POR APROBAR",
  aceptado: "ACEPTADO",
  ejecutado: "EJECUTADO",
  anulado: "ANULADO",
} as const;
const PAYMENT_TERMS_LABELS: Record<string, string> = {
  contado: "Contado",
  credito_10_dias: "Crédito 10 días",
  credito_30_dias: "Crédito 30 días",
  credito_60_dias: "Crédito 60 días",
  credito_90_dias: "Crédito 90 días",
  otro: "Otro",
};

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("es-CL") : "—";
}

function formatMoney(value: number) {
  return `$ ${value.toLocaleString("es-CL", { maximumFractionDigits: 0 })}`;
}

function ServiciosPage() {
  const access = useAppAccess();
  const canView = hasPermission(access?.name, access?.permissions, "purchases", "view");
  const canEdit = hasPermission(access?.name, access?.permissions, "purchases", "edit");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  const { data: services = [], isLoading, isError } = useQuery({
    queryKey: ["purchase-order-services"],
    enabled: canView,
    queryFn: async () => {
      const { data: rawItems, error: itemsError } = await supabase
        .from("purchase_order_items")
        .select("*")
        .eq("item_type", "servicio");
      if (itemsError) throw itemsError;
      const items = rawItems as ServiceItem[];
      if (!items.length) return [];

      const orderIds = [...new Set(items.map((item) => item.purchase_order_id))];
      const { data: rawOrders, error: ordersError } = await supabase
        .from("purchase_orders")
        .select("*")
        .in("id", orderIds);
      if (ordersError) throw ordersError;
      const orders = rawOrders as ServiceOrder[];
      const supplierIds = [...new Set(orders.map((order) => order.supplier_id))];
      const { data: supplierRows, error: suppliersError } = await supabase
        .from("supplier_directory")
        .select("id, name")
        .in("id", supplierIds);
      if (suppliersError) throw suppliersError;

      const orderById = new Map(orders.map((order) => [order.id, order]));
      const supplierById = new Map(supplierRows.map((supplier) => [supplier.id, supplier]));
      return items
        .map((item) => {
          const order = orderById.get(item.purchase_order_id);
          const serviceStatus =
            order?.status === "anulada"
              ? "anulado"
              : order?.approval_status === "aprobada"
                ? item.service_executed_at
                  ? "ejecutado"
                  : "aceptado"
                : "por_aprobar";
          return {
            ...item,
            order,
            supplierName: order ? (supplierById.get(order.supplier_id)?.name ?? "—") : "—",
            serviceStatus: serviceStatus as keyof typeof STATUS_LABELS,
          };
        })
        .sort((left, right) =>
          (right.order?.created_at ?? "").localeCompare(left.order?.created_at ?? ""),
        );
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
    const text =
      `${service.supplierName} ${service.order?.order_number ?? ""} ${service.description}`.toLowerCase();
    return (
      (!supplierFilter || service.supplierName === supplierFilter) &&
      (!statusFilter || service.serviceStatus === statusFilter) &&
      text.includes(search.trim().toLowerCase())
    );
  });
  const supplierNames = [...new Set(services.map((service) => service.supplierName))].sort();
  const totalQuantity = services.reduce((total, service) => total + Number(service.quantity), 0);
  const totalAmount = services.reduce((total, service) => total + Number(service.line_total), 0);
  const acceptedCount = services.filter((service) => service.serviceStatus === "aceptado").length;

  if (!canView) {
    return (
      <div className="card p-6 text-sm text-muted-foreground">
        No tienes permiso para consultar los servicios.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-bold">Servicios contratados</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Registro independiente de servicios asociados a órdenes de compra; no afecta el inventario.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-sm text-muted-foreground">Cantidad contratada</p>
          <p className="mt-1 text-2xl font-bold">{totalQuantity.toLocaleString("es-CL")}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-muted-foreground">Aceptados pendientes de ejecución</p>
          <p className="mt-1 text-2xl font-bold">{acceptedCount.toLocaleString("es-CL")}</p>
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
          <label className="label" htmlFor="services-supplier">
            Proveedor
          </label>
          <select
            id="services-supplier"
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
          <label className="label" htmlFor="services-status">
            Estado
          </label>
          <select
            id="services-status"
            className="input"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
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
                  <td>{formatDate(service.order?.created_at)}</td>
                  <td>{formatDate(service.order?.approved_at)}</td>
                  <td>
                    {service.order?.payment_terms_other ||
                      PAYMENT_TERMS_LABELS[service.order?.payment_terms ?? ""] ||
                      service.order?.payment_terms ||
                      "—"}
                  </td>
                  <td>{service.description}</td>
                  <td>
                    {service.quantity.toLocaleString("es-CL")} {service.measure_unit}
                  </td>
                  <td>{formatMoney(Number(service.line_total))}</td>
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
                      {STATUS_LABELS[service.serviceStatus]}
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
