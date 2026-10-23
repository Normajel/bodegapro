import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pencil, Plus, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { hasPermission, useAppAccess } from "@/lib/permissions";

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
type OrderItemDraft = {
  key: string;
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

const money = (value: number) => `$ ${value.toLocaleString("es-CL", { maximumFractionDigits: 0 })}`;

function newLine(): OrderItemDraft {
  return {
    key: `${Date.now()}-${Math.random()}`,
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
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState("");
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
  const activeOrderItems = useMemo(
    () => orderItems.filter((item) => item.purchase_order_id === activeOrderId),
    [activeOrderId, orderItems],
  );

  function invalidateOrders() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
      queryClient.invalidateQueries({ queryKey: ["purchase-order-items"] }),
      queryClient.invalidateQueries({ queryKey: ["movements"] }),
      queryClient.invalidateQueries({ queryKey: ["products"] }),
    ]);
  }

  function openNewOrder() {
    setEditingOrderId(null);
    setSupplierId("");
    setNotes("");
    setLines([newLine()]);
    setFormOpen(true);
  }

  function openEditOrder(orderId: string) {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;
    setEditingOrderId(order.id);
    setSupplierId(order.supplier_id);
    setNotes(order.notes ?? "");
    setLines(
      orderItems
        .filter((item) => item.purchase_order_id === order.id)
        .map((item) => ({
          key: item.id,
          product_id: item.product_id,
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
    if (!product) return;
    updateLine(key, {
      product_id: product.id,
      measure_unit: product.unit || "UN",
      unit_cost: product.unit_cost ?? 0,
    });
  }

  function openReceive(orderId: string) {
    const items = orderItems.filter((item) => item.purchase_order_id === orderId);
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
    const selected = lines.filter((line) => line.product_id);
    if (!supplierId) {
      toast.error("Selecciona un proveedor");
      return;
    }
    if (!selected.length) {
      toast.error("Agrega al menos un producto a la orden");
      return;
    }
    if (
      selected.some(
        (line) =>
          !Number.isFinite(line.quantity) ||
          line.quantity <= 0 ||
          !line.measure_unit.trim() ||
          !Number.isFinite(line.unit_cost) ||
          line.unit_cost < 0,
      )
    ) {
      toast.error("Revisa las cantidades, unidades y costos unitarios");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc("save_purchase_order", {
        p_supplier_id: supplierId,
        p_notes: notes.trim() || null,
        p_lines: selected.map((line) => ({
          ...(line.key.length === 36 ? { id: line.key } : {}),
          product_id: line.product_id,
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

  function orderTotal(orderId: string) {
    return orderItems
      .filter((item) => item.purchase_order_id === orderId)
      .reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compras</h1>
          <p className="text-sm text-muted-foreground">
            Órdenes de compra, recepciones y saldos pendientes.
          </p>
        </div>
        {canCreate && (
          <button className="btn btn-primary" onClick={openNewOrder}>
            <Plus className="h-4 w-4" />
            Nueva orden de compra
          </button>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base min-w-[780px]">
          <thead>
            <tr>
              <th>Orden</th>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Total ordenado</th>
              <th>Estado</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  Cargando órdenes…
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-destructive">
                  No se pudieron cargar las órdenes de compra.
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  No hay órdenes de compra. Crea una para comenzar.
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const status = order.status as OrderStatus;
                const supplier = suppliers.find((item) => item.id === order.supplier_id);
                return (
                  <tr key={order.id}>
                    <td className="font-mono text-sm">{order.order_number}</td>
                    <td className="whitespace-nowrap text-muted-foreground">
                      {new Date(order.created_at).toLocaleDateString("es-CL")}
                    </td>
                    <td>{supplier?.name ?? "—"}</td>
                    <td className="whitespace-nowrap font-medium">{money(orderTotal(order.id))}</td>
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
                      <div className="flex justify-end gap-1">
                        {status === "pendiente" && (canEdit || canDelete) && (
                          <>
                            {canEdit && (
                              <button
                                type="button"
                                className="btn btn-ghost p-1.5"
                                aria-label={`Editar ${order.order_number}`}
                                title="Editar orden"
                                disabled={saving}
                                onClick={() => openEditOrder(order.id)}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                className="btn btn-ghost p-1.5 text-destructive"
                                disabled={saving}
                                onClick={() => cancelOrder(order.id, order.order_number)}
                              >
                                Anular
                              </button>
                            )}
                          </>
                        )}
                        {canEdit && (status === "pendiente" || status === "parcial") && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={saving}
                            onClick={() => openReceive(order.id)}
                          >
                            <Truck className="h-4 w-4" />
                            Recibir
                          </button>
                        )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-foreground/40 p-4">
          <div className="card my-4 w-full max-w-4xl space-y-4 p-6">
            <div className="flex items-center justify-between">
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
            <form className="space-y-4" onSubmit={saveOrder}>
              <div className="grid gap-3 sm:grid-cols-2">
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
                  <label className="label">Observaciones</label>
                  <input
                    className="input"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">Productos de la orden</h3>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setLines((current) => [...current, newLine()])}
                  >
                    <Plus className="h-4 w-4" />
                    Agregar producto
                  </button>
                </div>
                {lines.map((line, index) => (
                  <div key={line.key} className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">Producto {index + 1}</span>
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
                    <div>
                      <label className="label">Descripción *</label>
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
                    {line.product_id && (
                      <div className="grid gap-3 sm:grid-cols-4">
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
                          <label className="label">Costo unitario *</label>
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
                          <span className="label">Subtotal</span>
                          <p className="py-2 font-semibold">
                            {money(line.quantity * line.unit_cost)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex justify-end rounded-lg border p-3">
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Total de la orden</p>
                    <p className="text-xl font-bold">
                      {money(lines.reduce((sum, line) => sum + line.quantity * line.unit_cost, 0))}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
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

      {receiveOpen && activeOrder && canEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-foreground/40 p-4">
          <div className="card my-4 w-full max-w-3xl space-y-4 p-6">
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
