import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Check, Eye, MoreHorizontal, Pencil, Plus, Printer, Search, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { hasPermission, useAppAccess } from "@/lib/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/compras")({
  head: () => ({
    meta: [
      { title: "Compras — BodegaPro" },
      { name: "description", content: "Crea órdenes de compra y registra sus recepciones." },
    ],
  }),
  component: ComprasPage,
});

type OrderStatus = "pendiente" | "parcial" | "completa" | "anulada";
type ApprovalStatus = "por_aprobar" | "aprobada";
type PurchaseItemType = "producto" | "servicio";
type PaymentTerms =
  | "contado"
  | "credito_10_dias"
  | "credito_30_dias"
  | "credito_60_dias"
  | "credito_90_dias"
  | "otro";
type OrderItemDraft = {
  key: string;
  item_type: PurchaseItemType;
  description: string;
  product_id: string;
  quantity: number;
  measure_unit: string;
  unit_cost: number;
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente: "Pendiente",
  parcial: "Recepción parcial",
  completa: "Completa",
  anulada: "Anulada",
};

const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
  contado: "Contado",
  credito_10_dias: "Crédito 10 días",
  credito_30_dias: "Crédito 30 días",
  credito_60_dias: "Crédito 60 días",
  credito_90_dias: "Crédito 90 días",
  otro: "Otro",
};

const money = (value: number) => `$ ${value.toLocaleString("es-CL", { maximumFractionDigits: 0 })}`;

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return fallback;
}

function newLine(itemType: PurchaseItemType = "producto"): OrderItemDraft {
  return {
    key: `${Date.now()}-${Math.random()}`,
    item_type: itemType,
    description: "",
    product_id: "",
    quantity: 1,
    measure_unit: "UN",
    unit_cost: 0,
  };
}

function ComprasPage() {
  const access = useAppAccess();
  const canCreate = hasPermission(access?.name, access?.permissions, "purchases", "create");
  const canEdit = hasPermission(access?.name, access?.permissions, "purchases", "edit");
  const canDelete = hasPermission(access?.name, access?.permissions, "purchases", "delete");
  const canApprove =
    canEdit && ["ADMIN", "GERENTE"].includes((access?.name ?? "").trim().toUpperCase());
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [costCentersOpen, setCostCentersOpen] = useState(false);
  const [previewOrderId, setPreviewOrderId] = useState<string | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingCostCenterId, setEditingCostCenterId] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [costCenterName, setCostCenterName] = useState("");
  const [orderDate, setOrderDate] = useState(localDateValue());
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>("contado");
  const [paymentTermsOther, setPaymentTermsOther] = useState("");
  const [description, setDescription] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [receiptFilter, setReceiptFilter] = useState<OrderStatus | "todos">("todos");
  const [approvalFilter, setApprovalFilter] = useState<ApprovalStatus | "todos">("todos");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderItemDraft[]>([newLine()]);
  const [documentType, setDocumentType] = useState<"factura" | "guia_despacho">("factura");
  const [documentNumber, setDocumentNumber] = useState("");
  const [receivedQuantities, setReceivedQuantities] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const {
    data: orders = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: orderItems = [] } = useQuery({
    queryKey: ["purchase-order-items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_order_items").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_directory")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: costCenters = [] } = useQuery({
    queryKey: ["purchase-cost-centers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_cost_centers")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, unit, unit_cost, stock")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const activeOrder = orders.find((order) => order.id === activeOrderId) ?? null;
  const previewOrder = orders.find((order) => order.id === previewOrderId) ?? null;
  const activeOrderItems = useMemo(
    () =>
      orderItems.filter(
        (item) => item.purchase_order_id === activeOrderId && item.item_type === "producto",
      ),
    [activeOrderId, orderItems],
  );
  const previewOrderItems = useMemo(
    () => orderItems.filter((item) => item.purchase_order_id === previewOrderId),
    [orderItems, previewOrderId],
  );
  const filteredOrders = useMemo(() => {
    const normalizedSearch = searchTerm
      .trim()
      .toLocaleLowerCase("es-CL")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    return orders.filter((order) => {
      const status = order.status as OrderStatus;
      const approvalStatus = order.approval_status as ApprovalStatus;
      const supplierName = suppliers.find((supplier) => supplier.id === order.supplier_id)?.name;
      const costCenterName = costCenters.find((center) => center.id === order.cost_center_id)?.name;
      const searchableText = [order.order_number, supplierName, costCenterName]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("es-CL")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      return (
        (!normalizedSearch || searchableText.includes(normalizedSearch)) &&
        (receiptFilter === "todos" || status === receiptFilter) &&
        (approvalFilter === "todos" || (status !== "anulada" && approvalStatus === approvalFilter))
      );
    });
  }, [approvalFilter, costCenters, orders, receiptFilter, searchTerm, suppliers]);

  function invalidateOrders() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
      queryClient.invalidateQueries({ queryKey: ["purchase-order-items"] }),
      queryClient.invalidateQueries({ queryKey: ["movements"] }),
      queryClient.invalidateQueries({ queryKey: ["products"] }),
      queryClient.invalidateQueries({ queryKey: ["purchase-cost-centers"] }),
    ]);
  }

  function openNewOrder() {
    setEditingOrderId(null);
    setSupplierId("");
    setCostCenterId("");
    setOrderDate(localDateValue());
    setPaymentTerms("contado");
    setPaymentTermsOther("");
    setDescription("");
    setNotes("");
    setLines([newLine()]);
    setFormOpen(true);
  }

  function openEditOrder(orderId: string) {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;
    setEditingOrderId(order.id);
    setSupplierId(order.supplier_id);
    setCostCenterId(order.cost_center_id ?? "");
    setOrderDate(order.order_date);
    setPaymentTerms(order.payment_terms as PaymentTerms);
    setPaymentTermsOther(order.payment_terms_other ?? "");
    setDescription(order.description ?? "");
    setNotes(order.notes ?? "");
    setLines(
      orderItems
        .filter((item) => item.purchase_order_id === order.id)
        .map((item) => ({
          key: item.id,
          item_type: item.item_type as PurchaseItemType,
          description: item.description,
          product_id: item.product_id ?? "",
          quantity: item.quantity,
          measure_unit: item.measure_unit,
          unit_cost: item.unit_cost,
        })),
    );
    setFormOpen(true);
  }

  function updateLine(key: string, changes: Partial<OrderItemDraft>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...changes } : line)),
    );
  }

  function selectProduct(key: string, productId: string) {
    const product = products.find((item) => item.id === productId);
    if (!product) {
      updateLine(key, { product_id: "", description: "" });
      return;
    }
    updateLine(key, {
      product_id: product.id,
      description: product.name,
      measure_unit: product.unit || "UN",
      unit_cost: product.unit_cost ?? 0,
    });
  }

  function openReceive(orderId: string) {
    const items = orderItems.filter(
      (item) => item.purchase_order_id === orderId && item.item_type === "producto",
    );
    setActiveOrderId(orderId);
    setReceivedQuantities(
      Object.fromEntries(items.map((item) => [item.id, item.quantity - item.received_quantity])),
    );
    setDocumentType("factura");
    setDocumentNumber("");
    setReceiveOpen(true);
  }

  async function saveOrder(event: React.FormEvent) {
    event.preventDefault();
    const selected = lines.filter((line) =>
      line.item_type === "producto" ? line.product_id : line.description.trim(),
    );
    if (!supplierId) {
      toast.error("Selecciona un proveedor");
      return;
    }
    if (!orderDate) {
      toast.error("Selecciona la fecha de la orden");
      return;
    }
    if (paymentTerms === "otro" && !paymentTermsOther.trim()) {
      toast.error("Especifica la condición de pago personalizada");
      return;
    }
    if (!selected.length) {
      toast.error("Agrega al menos un producto o servicio a la orden");
      return;
    }
    if (
      selected.length !== lines.length ||
      selected.some(
        (line) =>
          (line.item_type === "producto" && !line.product_id) ||
          (line.item_type === "servicio" && !line.description.trim()) ||
          !Number.isFinite(line.quantity) ||
          line.quantity <= 0 ||
          !line.measure_unit.trim() ||
          !Number.isFinite(line.unit_cost) ||
          line.unit_cost < 0,
      )
    ) {
      toast.error("Revisa los productos, servicios, cantidades, unidades y precios netos");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc("save_purchase_order", {
        p_supplier_id: supplierId,
        p_cost_center_id: costCenterId || null,
        p_order_date: orderDate,
        p_payment_terms: paymentTerms,
        p_payment_terms_other: paymentTerms === "otro" ? paymentTermsOther.trim() : null,
        p_description: description.trim() || null,
        p_notes: notes.trim() || null,
        p_lines: selected.map((line) => ({
          item_type: line.item_type,
          description: line.description.trim(),
          product_id: line.item_type === "producto" ? line.product_id : null,
          quantity: line.quantity,
          measure_unit: line.measure_unit.trim(),
          unit_cost: line.unit_cost,
        })),
        ...(editingOrderId ? { p_order_id: editingOrderId } : {}),
      });
      if (error) throw error;
      toast.success(editingOrderId ? "Orden de compra actualizada" : "Orden de compra creada");
      setFormOpen(false);
      await invalidateOrders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la orden");
    } finally {
      setSaving(false);
    }
  }

  async function receiveOrder(event: React.FormEvent) {
    event.preventDefault();
    if (!activeOrder) return;
    if (!documentNumber.trim()) {
      toast.error("Ingresa el número de factura o guía de despacho");
      return;
    }
    const linesToReceive = activeOrderItems.map((item) => ({
      item_id: item.id,
      quantity: receivedQuantities[item.id] ?? 0,
    }));
    if (!linesToReceive.some((line) => line.quantity > 0)) {
      toast.error("Ingresa al menos una cantidad recibida");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc("receive_purchase_order", {
        p_order_id: activeOrder.id,
        p_document_type: documentType,
        p_document_number: documentNumber.trim(),
        p_lines: linesToReceive,
      });
      if (error) throw error;
      toast.success("Recepción registrada y stock actualizado");
      setReceiveOpen(false);
      await invalidateOrders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo registrar la recepción");
    } finally {
      setSaving(false);
    }
  }

  async function cancelOrder(orderId: string, orderNumber: string) {
    if (!window.confirm(`¿Anular la orden ${orderNumber}?`)) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("cancel_purchase_order", { p_order_id: orderId });
      if (error) throw error;
      toast.success("Orden anulada");
      await invalidateOrders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo anular la orden");
    } finally {
      setSaving(false);
    }
  }

  async function approveOrder(orderId: string, orderNumber: string) {
    if (!window.confirm(`¿Aprobar la orden ${orderNumber}?`)) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("approve_purchase_order", { p_order_id: orderId });
      if (error) throw error;
      toast.success("Orden aprobada");
      await invalidateOrders();
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo aprobar la orden"));
    } finally {
      setSaving(false);
    }
  }

  async function saveCostCenter(event: React.FormEvent) {
    event.preventDefault();
    const name = costCenterName.trim();
    if (!name) {
      toast.error("Ingresa el nombre del centro de costo");
      return;
    }

    setSaving(true);
    try {
      const query = editingCostCenterId
        ? supabase.from("purchase_cost_centers").update({ name }).eq("id", editingCostCenterId)
        : supabase.from("purchase_cost_centers").insert({ name });
      const { error } = await query;
      if (error) throw error;
      toast.success(editingCostCenterId ? "Centro de costo actualizado" : "Centro de costo creado");
      setCostCenterName("");
      setEditingCostCenterId(null);
      await queryClient.invalidateQueries({ queryKey: ["purchase-cost-centers"] });
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo guardar el centro de costo"));
    } finally {
      setSaving(false);
    }
  }

  async function assignCostCenter(orderId: string, costCenterId: string) {
    if (!costCenterId) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("purchase_orders")
        .update({ cost_center_id: costCenterId })
        .eq("id", orderId)
        .is("cost_center_id", null)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error("La orden ya tiene un centro de costo asignado o no se pudo actualizar");
      }
      toast.success("Centro de costo asignado");
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo asignar el centro de costo"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteCostCenter(id: string, name: string) {
    if (!window.confirm(`¿Eliminar el centro de costo “${name}”?`)) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("purchase_cost_centers").delete().eq("id", id);
      if (error) throw error;
      if (costCenterId === id) setCostCenterId("");
      toast.success("Centro de costo eliminado");
      await queryClient.invalidateQueries({ queryKey: ["purchase-cost-centers"] });
    } catch (error) {
      toast.error(
        errorMessage(error, "No se pudo eliminar; puede estar asociado a órdenes de compra"),
      );
    } finally {
      setSaving(false);
    }
  }

  function printOrder(orderId: string) {
    setPreviewOrderId(orderId);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.print()));
  }

  function orderTotal(orderId: string) {
    const order = orders.find((item) => item.id === orderId);
    return Number(order?.total_amount ?? 0);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Órdenes de compra</h1>
          <p className="text-sm text-muted-foreground">
            Órdenes de compra, recepciones y saldos pendientes.
          </p>
        </div>
        {(canCreate || canEdit) && (
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setEditingCostCenterId(null);
                  setCostCenterName("");
                  setCostCentersOpen(true);
                }}
              >
                Administrar centros de costo
              </button>
            )}
            {canCreate && (
              <button className="btn btn-primary" onClick={openNewOrder}>
                <Plus className="h-4 w-4" />
                Nueva orden de compra
              </button>
            )}
          </div>
        )}
      </div>

      <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,2fr)_minmax(12rem,1fr)_minmax(12rem,1fr)_auto]">
        <div>
          <label className="label" htmlFor="purchase-order-search">
            Buscar orden
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="purchase-order-search"
              className="input pl-9"
              type="search"
              placeholder="N° OC, proveedor o centro de costo"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="purchase-order-receipt-filter">
            Recepción
          </label>
          <select
            id="purchase-order-receipt-filter"
            className="input"
            value={receiptFilter}
            onChange={(event) => setReceiptFilter(event.target.value as OrderStatus | "todos")}
          >
            <option value="todos">Todas las recepciones</option>
            <option value="pendiente">Pendiente</option>
            <option value="parcial">Recepción parcial</option>
            <option value="completa">Completa</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="purchase-order-approval-filter">
            Estado de aprobación
          </label>
          <select
            id="purchase-order-approval-filter"
            className="input"
            value={approvalFilter}
            onChange={(event) => setApprovalFilter(event.target.value as ApprovalStatus | "todos")}
          >
            <option value="todos">Todos los estados</option>
            <option value="aprobada">Aprobado</option>
            <option value="por_aprobar">Por aprobar</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="button"
            className="btn btn-secondary w-full"
            disabled={!searchTerm && receiptFilter === "todos" && approvalFilter === "todos"}
            onClick={() => {
              setSearchTerm("");
              setReceiptFilter("todos");
              setApprovalFilter("todos");
            }}
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base min-w-[1080px]">
          <thead>
            <tr>
              <th>N° OC</th>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Total OC</th>
              <th>Centro de costo</th>
              <th>Recepción</th>
              <th>Estado</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted-foreground">
                  Cargando órdenes…
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-destructive">
                  No se pudieron cargar las órdenes de compra.
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted-foreground">
                  No hay órdenes de compra. Crea una para comenzar.
                </td>
              </tr>
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted-foreground">
                  No se encontraron órdenes con esos criterios.
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => {
                const status = order.status as OrderStatus;
                const approvalStatus = order.approval_status as ApprovalStatus;
                const supplier = suppliers.find((item) => item.id === order.supplier_id);
                const costCenter = costCenters.find((item) => item.id === order.cost_center_id);
                return (
                  <tr key={order.id}>
                    <td className="font-mono text-sm">{order.order_number}</td>
                    <td className="whitespace-nowrap text-muted-foreground">
                      {new Date(`${order.order_date}T00:00:00`).toLocaleDateString("es-CL")}
                    </td>
                    <td>{supplier?.name ?? "—"}</td>
                    <td className="whitespace-nowrap font-medium">{money(orderTotal(order.id))}</td>
                    <td>
                      {costCenter?.name ??
                        (canEdit && status !== "anulada" && costCenters.length > 0 ? (
                          <select
                            className="input min-w-40"
                            aria-label={`Asignar centro de costo a ${order.order_number}`}
                            value=""
                            disabled={saving}
                            onChange={(event) => assignCostCenter(order.id, event.target.value)}
                          >
                            <option value="">Sin asignar · Elegir…</option>
                            {costCenters.map((center) => (
                              <option key={center.id} value={center.id}>
                                {center.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          "Sin asignar"
                        ))}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          status === "completa"
                            ? "badge-success"
                            : status === "anulada"
                              ? "badge-destructive"
                              : status === "parcial"
                                ? "badge-warning"
                                : "badge-secondary"
                        }`}
                      >
                        {STATUS_LABELS[status] ?? status}
                      </span>
                    </td>
                    <td>
                      {status === "anulada" ? (
                        "—"
                      ) : canApprove &&
                        status === "pendiente" &&
                        approvalStatus === "por_aprobar" ? (
                        <button
                          type="button"
                          className="badge badge-warning inline-flex items-center gap-1.5 transition-colors hover:bg-warning/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`Aprobar orden ${order.order_number}`}
                          disabled={saving}
                          onClick={() => approveOrder(order.id, order.order_number)}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Por aprobar · Aprobar
                        </button>
                      ) : (
                        <span
                          className={`badge ${
                            approvalStatus === "aprobada" ? "badge-success" : "badge-warning"
                          }`}
                        >
                          {approvalStatus === "aprobada" ? "Aprobada" : "Por aprobar"}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="btn btn-ghost p-1.5"
                              aria-label={`Acciones de ${order.order_number}`}
                              disabled={saving}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setPreviewOrderId(order.id)}>
                              <Eye className="h-4 w-4" />
                              Vista previa
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => printOrder(order.id)}>
                              <Printer className="h-4 w-4" />
                              Imprimir
                            </DropdownMenuItem>
                            {canEdit && status === "pendiente" && (
                              <DropdownMenuItem onSelect={() => openEditOrder(order.id)}>
                                <Pencil className="h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                            )}
                            {canDelete && status === "pendiente" && (
                              <DropdownMenuItem
                                className="text-destructive"
                                onSelect={() => cancelOrder(order.id, order.order_number)}
                              >
                                Anular
                              </DropdownMenuItem>
                            )}
                            {canEdit &&
                              approvalStatus === "aprobada" &&
                              (status === "pendiente" || status === "parcial") &&
                              orderItems.some(
                                (item) =>
                                  item.purchase_order_id === order.id &&
                                  item.item_type === "producto",
                              ) && (
                                <DropdownMenuItem onSelect={() => openReceive(order.id)}>
                                  <Truck className="h-4 w-4" />
                                  Recibir
                                </DropdownMenuItem>
                              )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (editingOrderId ? canEdit : canCreate) && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto sm:items-center bg-foreground/40 p-4">
          <div className="card my-2 flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col gap-3 overflow-hidden p-4 text-sm sm:my-4 sm:p-5">
            <div className="flex shrink-0 items-center justify-between">
              <h2 className="font-display text-lg font-bold">
                {editingOrderId ? "Editar orden de compra" : "Nueva orden de compra"}
              </h2>
              <button
                type="button"
                className="btn btn-ghost p-1.5"
                onClick={() => setFormOpen(false)}
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form className="flex min-h-0 flex-1 flex-col gap-3" onSubmit={saveOrder}>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="label">Fecha *</label>
                    <input
                      className="input"
                      type="date"
                      value={orderDate}
                      onChange={(event) => setOrderDate(event.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Proveedor *</label>
                    <select
                      className="input"
                      value={supplierId}
                      onChange={(event) => setSupplierId(event.target.value)}
                      required
                    >
                      <option value="">Selecciona proveedor…</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Condiciones de pago *</label>
                    <select
                      className="input"
                      value={paymentTerms}
                      onChange={(event) => setPaymentTerms(event.target.value as PaymentTerms)}
                      required
                    >
                      {Object.entries(PAYMENT_TERMS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {paymentTerms === "otro" && (
                    <div>
                      <label className="label">Otra condición de pago *</label>
                      <input
                        className="input"
                        value={paymentTermsOther}
                        onChange={(event) => setPaymentTermsOther(event.target.value)}
                        maxLength={120}
                        placeholder="Especifica la condición"
                        required
                      />
                    </div>
                  )}
                  <div>
                    <label className="label">Centro de costo</label>
                    <select
                      className="input"
                      value={costCenterId}
                      onChange={(event) => setCostCenterId(event.target.value)}
                    >
                      <option value="">Sin asignar</option>
                      {costCenters.map((center) => (
                        <option key={center.id} value={center.id}>
                          {center.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Observaciones</label>
                    <input
                      className="input"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="label">Descripción general</label>
                    <textarea
                      className="input min-h-0"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      rows={2}
                      maxLength={2000}
                      placeholder="Descripción general de la orden de compra"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">Productos y servicios</h3>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setLines((current) => [...current, newLine("producto")])}
                      >
                        <Plus className="h-4 w-4" />
                        Agregar producto
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setLines((current) => [...current, newLine("servicio")])}
                      >
                        <Plus className="h-4 w-4" />
                        Agregar servicio
                      </button>
                    </div>
                  </div>
                  {lines.map((line, index) => (
                    <div key={line.key} className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">
                          {line.item_type === "producto" ? "Producto" : "Servicio"} {index + 1}
                        </span>
                        <button
                          type="button"
                          className="btn btn-ghost text-destructive"
                          aria-label={`Quitar producto ${index + 1}`}
                          onClick={() =>
                            setLines((current) => {
                              const remaining = current.filter((item) => item.key !== line.key);
                              return remaining.length ? remaining : [newLine()];
                            })
                          }
                        >
                          Quitar
                        </button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
                        <div>
                          <label className="label">Tipo de línea</label>
                          <select
                            className="input"
                            value={line.item_type}
                            onChange={(event) => {
                              const itemType = event.target.value as PurchaseItemType;
                              updateLine(line.key, {
                                item_type: itemType,
                                product_id: "",
                                description: "",
                                measure_unit: itemType === "servicio" ? "SERV" : "UN",
                                unit_cost: 0,
                              });
                            }}
                          >
                            <option value="producto">Producto de inventario</option>
                            <option value="servicio">Servicio</option>
                          </select>
                        </div>
                        {line.item_type === "producto" ? (
                          <div>
                            <label className="label">Producto *</label>
                            <select
                              className="input"
                              value={line.product_id}
                              onChange={(event) => selectProduct(line.key, event.target.value)}
                              required
                            >
                              <option value="">Selecciona un producto…</option>
                              {products.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.name} ({product.sku}) · Stock {product.stock}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div>
                            <label className="label">Detalle del servicio *</label>
                            <textarea
                              className="input min-h-0"
                              value={line.description}
                              onChange={(event) =>
                                updateLine(line.key, { description: event.target.value })
                              }
                              rows={2}
                              maxLength={500}
                              placeholder="Describe el servicio contratado"
                              required
                            />
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div>
                          <label className="label">Cantidad *</label>
                          <input
                            className="input"
                            type="number"
                            min="0.001"
                            step="0.001"
                            value={line.quantity}
                            onChange={(event) =>
                              updateLine(line.key, { quantity: Number(event.target.value) })
                            }
                            required
                          />
                        </div>
                        <div>
                          <label className="label">Unidad *</label>
                          <input
                            className="input"
                            value={line.measure_unit}
                            onChange={(event) =>
                              updateLine(line.key, { measure_unit: event.target.value })
                            }
                            required
                          />
                        </div>
                        <div>
                          <label className="label">Precio neto unitario *</label>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="1"
                            value={line.unit_cost}
                            onChange={(event) =>
                              updateLine(line.key, { unit_cost: Number(event.target.value) })
                            }
                            required
                          />
                        </div>
                        <div className="flex flex-col justify-end">
                          <span className="label">Subtotal neto</span>
                          <p className="py-1.5 font-semibold">
                            {money(Math.round(line.quantity * line.unit_cost))}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end rounded-lg border p-3">
                    <div className="w-full max-w-xs space-y-0.5 text-right">
                      {(() => {
                        const netTotal = lines.reduce(
                          (sum, line) => sum + Math.round(line.quantity * line.unit_cost),
                          0,
                        );
                        const vatAmount = Math.round(netTotal * 0.19);
                        return (
                          <>
                            <p className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Subtotal neto</span>
                              <span className="font-medium">{money(netTotal)}</span>
                            </p>
                            <p className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Total neto</span>
                              <span className="font-medium">{money(netTotal)}</span>
                            </p>
                            <p className="flex justify-between gap-4">
                              <span className="text-muted-foreground">IVA (19%)</span>
                              <span className="font-medium">{money(vatAmount)}</span>
                            </p>
                            <p className="flex justify-between gap-4 border-t pt-1.5 text-base font-bold">
                              <span>Total</span>
                              <span>{money(netTotal + vatAmount)}</span>
                            </p>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 justify-end gap-2 border-t pt-3">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={saving}
                  onClick={() => setFormOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Guardando…" : "Guardar orden"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {costCentersOpen && canEdit && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto sm:items-center bg-foreground/40 p-4">
          <div className="card my-2 w-full max-w-2xl space-y-4 p-4 sm:my-4 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Centros de costo</h2>
              <button
                type="button"
                className="btn btn-ghost p-1.5"
                onClick={() => {
                  setCostCentersOpen(false);
                  setEditingCostCenterId(null);
                  setCostCenterName("");
                }}
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form className="flex flex-wrap gap-2" onSubmit={saveCostCenter}>
              <input
                className="input min-w-48 flex-1"
                value={costCenterName}
                onChange={(event) => setCostCenterName(event.target.value)}
                placeholder="Nombre del centro de costo"
                maxLength={120}
                required
              />
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {editingCostCenterId ? "Guardar cambios" : "Agregar"}
              </button>
              {editingCostCenterId && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setEditingCostCenterId(null);
                    setCostCenterName("");
                  }}
                >
                  Cancelar edición
                </button>
              )}
            </form>
            <div className="divide-y rounded-md border">
              {costCenters.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Aún no hay centros de costo.</p>
              ) : (
                costCenters.map((center) => (
                  <div key={center.id} className="flex items-center justify-between gap-3 p-3">
                    <span>{center.name}</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="btn btn-ghost p-1.5"
                        aria-label={`Editar ${center.name}`}
                        onClick={() => {
                          setEditingCostCenterId(center.id);
                          setCostCenterName(center.name);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost p-1.5 text-destructive"
                        aria-label={`Eliminar ${center.name}`}
                        disabled={saving}
                        onClick={() => deleteCostCenter(center.id, center.name)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              No se pueden eliminar centros que estén asociados a órdenes de compra.
            </p>
          </div>
        </div>
      )}

      {previewOrder && (
        <>
          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              .purchase-order-print, .purchase-order-print * { visibility: visible !important; }
              .purchase-order-print {
                position: absolute !important;
                inset: 0 !important;
                width: 100% !important;
                max-width: none !important;
                margin: 0 !important;
                overflow: visible !important;
                border: 0 !important;
                box-shadow: none !important;
              }
              .purchase-order-print-actions { display: none !important; }
            }
          `}</style>
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto sm:items-center bg-foreground/40 p-4">
            <div className="purchase-order-print card my-4 w-full max-w-3xl space-y-5 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-xl font-bold">
                    Orden de compra {previewOrder.order_number}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {new Date(`${previewOrder.order_date}T00:00:00`).toLocaleDateString("es-CL")}
                  </p>
                </div>
                <div className="purchase-order-print-actions flex gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => window.print()}
                  >
                    <Printer className="h-4 w-4" />
                    Imprimir
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost p-1.5"
                    onClick={() => setPreviewOrderId(null)}
                    aria-label="Cerrar vista previa"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <dl className="grid gap-3 border-b pb-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-muted-foreground">Proveedor</dt>
                  <dd className="font-medium">
                    {suppliers.find((item) => item.id === previewOrder.supplier_id)?.name ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Centro de costo</dt>
                  <dd className="font-medium">
                    {costCenters.find((item) => item.id === previewOrder.cost_center_id)?.name ??
                      "Sin asignar"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Condiciones de pago</dt>
                  <dd className="font-medium">
                    {previewOrder.payment_terms === "otro"
                      ? previewOrder.payment_terms_other
                      : PAYMENT_TERMS_LABELS[previewOrder.payment_terms as PaymentTerms]}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Estado</dt>
                  <dd>
                    {STATUS_LABELS[previewOrder.status as OrderStatus] ?? previewOrder.status}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Aprobación</dt>
                  <dd>
                    {previewOrder.status === "anulada"
                      ? "—"
                      : previewOrder.approval_status === "aprobada"
                        ? "Aprobada"
                        : "Por aprobar"}
                  </dd>
                </div>
                {previewOrder.description && (
                  <div className="sm:col-span-2">
                    <dt className="text-sm text-muted-foreground">Descripción</dt>
                    <dd>{previewOrder.description}</dd>
                  </div>
                )}
                {previewOrder.notes && (
                  <div className="sm:col-span-2">
                    <dt className="text-sm text-muted-foreground">Observaciones</dt>
                    <dd>{previewOrder.notes}</dd>
                  </div>
                )}
              </dl>
              <div className="overflow-x-auto">
                <table className="table-base min-w-[560px]">
                  <thead>
                    <tr>
                      <th>Descripción</th>
                      <th>Cantidad</th>
                      <th>Unidad</th>
                      <th>Precio neto</th>
                      <th>Subtotal neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewOrderItems.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.item_type === "servicio"
                            ? `Servicio: ${item.description}`
                            : item.description}
                        </td>
                        <td>{item.quantity}</td>
                        <td>{item.measure_unit}</td>
                        <td>{money(item.unit_cost)}</td>
                        <td>{money(item.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="ml-auto w-full max-w-sm space-y-1 text-right">
                <p className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Subtotal neto</span>
                  <span>{money(previewOrder.net_total)}</span>
                </p>
                <p className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Total neto</span>
                  <span>{money(previewOrder.net_total)}</span>
                </p>
                <p className="flex justify-between gap-4">
                  <span className="text-muted-foreground">IVA (19%)</span>
                  <span>{money(previewOrder.vat_amount)}</span>
                </p>
                <p className="flex justify-between gap-4 border-t pt-2 text-xl font-bold">
                  <span>Total</span>
                  <span>{money(previewOrder.total_amount)}</span>
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {receiveOpen && activeOrder && canEdit && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto sm:items-center bg-foreground/40 p-4">
          <div className="card my-2 w-full max-w-3xl space-y-4 p-4 sm:my-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-bold">
                  Recibir {activeOrder.order_number}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Ingresa cantidades parciales o el total pendiente de cada producto.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost p-1.5"
                onClick={() => setReceiveOpen(false)}
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form className="space-y-4" onSubmit={receiveOrder}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Tipo de documento *</label>
                  <select
                    className="input"
                    value={documentType}
                    onChange={(event) =>
                      setDocumentType(event.target.value as "factura" | "guia_despacho")
                    }
                  >
                    <option value="factura">Factura</option>
                    <option value="guia_despacho">Guía de despacho</option>
                  </select>
                </div>
                <div>
                  <label className="label">Número de documento *</label>
                  <input
                    className="input"
                    value={documentNumber}
                    onChange={(event) => setDocumentNumber(event.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                {activeOrderItems.map((item) => {
                  const product = products.find((entry) => entry.id === item.product_id);
                  const remaining = item.quantity - item.received_quantity;
                  return (
                    <div
                      key={item.id}
                      className="grid items-center gap-2 rounded-md border p-3 sm:grid-cols-[1fr_auto_9rem]"
                    >
                      <div>
                        <p className="font-medium">{product?.name ?? "Producto"}</p>
                        <p className="text-xs text-muted-foreground">
                          Pendiente: {remaining} {item.measure_unit} de {item.quantity}
                        </p>
                      </div>
                      <label className="text-sm text-muted-foreground">Recibir ahora</label>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        max={remaining}
                        step="0.001"
                        value={receivedQuantities[item.id] ?? 0}
                        onChange={(event) =>
                          setReceivedQuantities((current) => ({
                            ...current,
                            [item.id]: Number(event.target.value),
                          }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={saving}
                  onClick={() => setReceiveOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Registrando…" : "Registrar recepción"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
