import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  UNIT_TYPE_LABELS,
  folioLabel,
  generarComprobante,
  generarComprobanteCompra,
  generarComprobanteSalida,
} from "@/lib/comprobante-pdf";
import { UNITS } from "@/lib/warehouse";

export const Route = createFileRoute("/_authenticated/movimientos")({
  head: () => ({
    meta: [
      { title: "Movimientos — BodegaPro" },
      {
        name: "description",
        content: "Registro de entradas y salidas de stock de la bodega.",
      },
    ],
  }),
  component: MovimientosPage,
});

type FormState = {
  product_id: string;
  type: "entrada" | "salida";
  quantity: number;
  supplier_id: string;
  unit_type: string;
  unit_type_value: string;
  document_number: string;
  reference: string;
  notes: string;
};

type PurchaseItem = {
  key: string;
  id?: string;
  product_id: string;
  search: string;
  quantity: number;
  unit: string;
  unitIsOther?: boolean;
  unit_price: number;
};

type PriceRecord = {
  product_id: string;
  unit_price: number;
  unit: string;
  created_at: string;
};

type PurchaseEntry = {
  id: string;
  created_at: string;
  supplier_id: string | null;
  document_type: "factura" | "guia_despacho";
  document_number: string;
  purchase_order: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
};

const emptyForm: FormState = {
  product_id: "",
  type: "entrada",
  quantity: 1,
  supplier_id: "",
  unit_type: "stock",
  unit_type_value: "",
  document_number: "",
  reference: "",
  notes: "",
};

const UNIDADES = [
  "2102C2OFPL",
  "2111-C2OFBA",
  "2103C2B333",
  "2104 C2VEST",
  "2105 C2COMEDOR",
  "2103-C2BLL",
  "2103C2WCBB",
  "1102-M2OFPL",
  "1111-M2OFBA",
  "M2 BAÑO 3X3X3",
  "1111-20-M2OFBACOMPLETO",
  "1102-10-M2OFDUPLEX",
  "1111-30 M2 MINICABAÑA",
  "1102-30 M2OFBOD",
  "1102-M2SALA MULTIUSO",
  "1202M6X3OFPL",
  "1101M2BOD",
  "1002M1OFPL",
  "1003M1BABA",
  "1002-1M1CGCV",
  "1001M1BOD",
  "3002BCG",
  "BOX40",
] as const;

function newPurchaseItem(): PurchaseItem {
  return {
    key: `${Date.now()}-${Math.random()}`,
    product_id: "",
    search: "",
    quantity: 1,
    unit: "unidad",
    unitIsOther: true,
    unit_price: 0,
  };
}

function formatMoney(value: number) {
  return `$ ${Number(value || 0).toLocaleString("es-CL", {
    maximumFractionDigits: 0,
  })}`;
}

function MovimientosPage() {
  const queryClient = useQueryClient();
  const db = supabase as any;

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([newPurchaseItem()]);
  const [purchaseOrder, setPurchaseOrder] = useState("");
  const [documentType, setDocumentType] = useState<"factura" | "guia_despacho">("factura");
  const [documentNumber, setDocumentNumber] = useState("");
  const [filterType, setFilterType] = useState<"" | "entrada" | "salida">("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  useEffect(() => {
    const channel = supabase
      .channel("movements-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements" }, () => {
        queryClient.invalidateQueries({ queryKey: ["movements"] });
        queryClient.invalidateQueries({ queryKey: ["products"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*, products(name, sku, unit), suppliers(name), customers(name)")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, stock, unit, unit_cost")
        .eq("active", true)
        .order("name");

      if (error) throw error;
      return data;
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name").order("name");

      if (error) throw error;
      return data;
    },
  });

  const { data: purchases = [], isLoading: purchasesLoading } = useQuery<PurchaseEntry[]>({
    queryKey: ["purchase-entries"],
    queryFn: async () => {
      const { data, error } = await db
        .from("purchase_entries")
        .select(
          `
          id,
          created_at,
          supplier_id,
          document_type,
          document_number,
          purchase_order,
          cancelled_at,
          cancellation_reason
        `,
        )
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: priceHistory = [] } = useQuery<PriceRecord[]>({
    queryKey: ["purchase-price-history"],
    queryFn: async () => {
      const { data, error } = await db
        .from("purchase_entry_items")
        .select("product_id, unit_price, unit, created_at")
        .order("created_at", { ascending: false })
        .limit(5000);

      if (error) throw error;
      return (data ?? []) as PriceRecord[];
    },
  });

  const pricesByProduct = useMemo(() => {
    const grouped: Record<string, PriceRecord[]> = {};

    for (const record of priceHistory) {
      const productPrices = grouped[record.product_id] ?? [];

      if (productPrices.length < 3) {
        productPrices.push(record);
        grouped[record.product_id] = productPrices;
      }
    }

    return grouped;
  }, [priceHistory]);

  const filtered = useMemo(() => {
    return movements.filter((m) => {
      if (filterType && m.type !== filterType) return false;

      const date = new Date(m.created_at);

      if (filterFrom && date < new Date(`${filterFrom}T00:00:00`)) {
        return false;
      }

      if (filterTo && date > new Date(`${filterTo}T23:59:59`)) {
        return false;
      }

      return true;
    });
  }, [movements, filterType, filterFrom, filterTo]);

  type Movement = (typeof movements)[number];

  function printMovement(m: {
    folio: number | null;
    type: "entrada" | "salida";
    created_at: string;
    product_id: string;
    quantity: number;
    unit_type: string | null;
    unit_type_value: string | null;
    document_number: string | null;
    supplier_id: string | null;
    reference: string | null;
    notes: string | null;
  }) {
    const product = products.find((p) => p.id === m.product_id);
    const fromList = movements.find((x) => x.product_id === m.product_id)?.products;

    generarComprobante({
      folio: m.folio,
      type: m.type,
      created_at: m.created_at,
      product_name: product?.name ?? fromList?.name ?? "—",
      product_sku: product?.sku ?? fromList?.sku ?? "—",
      unit: product?.unit ?? fromList?.unit ?? "",
      quantity: m.quantity,
      unit_type: m.unit_type,
      unit_type_value: m.unit_type_value,
      document_number: m.document_number,
      supplier: suppliers.find((s) => s.id === m.supplier_id)?.name ?? null,
      master_name: m.reference,
      notes: m.notes,
    });
  }

  function openNew() {
    setEditingId(null);
    setEditingBatchId(null);
    setForm(emptyForm);
    setPurchaseItems([newPurchaseItem()]);
    setPurchaseOrder("");
    setDocumentType("factura");
    setDocumentNumber("");
    setFormOpen(true);
  }

  function openEdit(m: Movement) {
    setEditingId(m.id);
    setEditingBatchId(m.batch_id);
    setForm({
      product_id: m.product_id,
      type: m.type,
      quantity: m.quantity,
      supplier_id: m.supplier_id ?? "",
      unit_type: m.unit_type ?? "stock",
      unit_type_value: m.unit_type_value ?? "",
      document_number: m.document_number ?? "",
      reference: m.reference ?? "",
      notes: m.notes ?? "",
    });
    if (m.type === "salida") {
      const batchMovements = m.batch_id
        ? movements.filter((movement) => movement.batch_id === m.batch_id)
        : [m];
      setPurchaseItems(
        batchMovements.map((movement) => {
          const product = products.find((item) => item.id === movement.product_id);
          const unit = movement.measure_unit ?? product?.unit ?? "unidad";
          return {
            key: movement.id,
            id: movement.id,
            product_id: movement.product_id,
            search: product?.name ?? movement.products?.name ?? "",
            quantity: movement.quantity_value,
            unit,
            unitIsOther: !UNITS.includes(unit as (typeof UNITS)[number]),
            unit_price: movement.unit_cost ?? product?.unit_cost ?? 0,
          };
        }),
      );
    }
    setFormOpen(true);
  }

  function updatePurchaseItem(key: string, changes: Partial<PurchaseItem>) {
    setPurchaseItems((items) =>
      items.map((item) => (item.key === key ? { ...item, ...changes } : item)),
    );
  }

  function selectProduct(key: string, productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const previousPrices = pricesByProduct[productId] ?? [];
    const lastPrice = previousPrices[0]?.unit_price ?? 0;

    updatePurchaseItem(key, {
      product_id: product.id,
      search: product.name,
      unit: product.unit || "unidad",
      unitIsOther: !UNITS.includes((product.unit || "unidad") as (typeof UNITS)[number]),
      unit_price: lastPrice || product.unit_cost || 0,
    });
  }

  function removePurchaseItem(key: string) {
    setPurchaseItems((items) => {
      const next = items.filter((item) => item.key !== key);
      return next.length ? next : [newPurchaseItem()];
    });
  }

  const purchaseTotal = purchaseItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0,
  );
  const exitTotal = purchaseItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

  async function save(print: boolean) {
    const isNewPurchase = form.type === "entrada" && !editingId;

    if (isNewPurchase) {
      const validItems = purchaseItems.filter((item) => item.product_id);

      if (validItems.length === 0) {
        toast.error("Agrega al menos un producto a la compra");
        return;
      }

      if (
        validItems.some(
          (item) => !item.quantity || item.quantity <= 0 || !Number.isFinite(item.quantity),
        )
      ) {
        toast.error("Todas las cantidades deben ser mayores a 0");
        return;
      }

      if (validItems.some((item) => !Number.isFinite(item.unit_price) || item.unit_price < 0)) {
        toast.error("Revisa los precios de los productos");
        return;
      }

      if (!documentNumber.trim()) {
        toast.error("Ingresa el número de factura o guía de despacho");
        return;
      }

      setSaving(true);

      try {
        const itemsPayload = validItems.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit: item.unit.trim() || "unidad",
          unit_price: item.unit_price,
        }));

        const { data, error } = await db.rpc("registrar_entrada_compra", {
          p_supplier_id: form.supplier_id || null,
          p_purchase_order: purchaseOrder.trim() || null,
          p_document_type: documentType,
          p_document_number: documentNumber.trim(),
          p_notes: form.notes.trim() || null,
          p_items: itemsPayload,
        });

        if (error) throw error;

        const purchaseId = String(data);
        const supplierName =
          suppliers.find((s) => s.id === form.supplier_id)?.name ?? "Sin proveedor";

        toast.success("Compra registrada y stock actualizado");

        if (print) {
          generarComprobanteCompra({
            id: purchaseId,
            created_at: new Date().toISOString(),
            supplier: supplierName,
            purchase_order: purchaseOrder.trim(),
            document_type: documentType,
            document_number: documentNumber.trim(),
            notes: form.notes.trim(),
            items: validItems.map((item) => {
              const product = products.find((p) => p.id === item.product_id);

              return {
                product_name: product?.name ?? item.search,
                product_sku: product?.sku ?? "—",
                quantity: item.quantity,
                unit: item.unit,
                unit_price: item.unit_price,
              };
            }),
          });
        }

        setFormOpen(false);
        setEditingId(null);
        setForm(emptyForm);
        setPurchaseItems([newPurchaseItem()]);
        setPurchaseOrder("");
        setDocumentType("factura");
        setDocumentNumber("");

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["movements"] }),
          queryClient.invalidateQueries({ queryKey: ["products"] }),
          queryClient.invalidateQueries({
            queryKey: ["purchase-entries"],
          }),
          queryClient.invalidateQueries({
            queryKey: ["purchase-price-history"],
          }),
        ]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al registrar la compra");
      } finally {
        setSaving(false);
      }

      return;
    }

    if (form.type === "salida") {
      const validItems = purchaseItems.filter((item) => item.product_id);

      if (validItems.length === 0) {
        toast.error("Agrega al menos un producto a la salida");
        return;
      }

      if (
        validItems.some(
          (item) =>
            !item.quantity ||
            item.quantity <= 0 ||
            !Number.isFinite(item.quantity) ||
            !item.unit.trim(),
        )
      ) {
        toast.error("Revisa las cantidades y unidades de medida");
        return;
      }

      if (validItems.some((item) => !Number.isFinite(item.unit_price) || item.unit_price < 0)) {
        toast.error("Revisa los costos unitarios de los productos");
        return;
      }

      setSaving(true);

      try {
        const { data, error } = await db.rpc("save_movement_batch", {
          payload: {
            type: "salida",
            supplier_id: null,
            reference: form.reference.trim() || null,
            notes: form.notes.trim() || null,
            unit_type: form.unit_type,
            unit_type_value: form.unit_type_value || null,
            document_number: form.document_number.trim() || null,
            lines: validItems.map((item) => ({
              ...(item.id ? { id: item.id } : {}),
              product_id: item.product_id,
              quantity: item.quantity,
              measure_unit: item.unit.trim(),
              unit_cost: item.unit_price,
            })),
          },
          edit_batch: editingBatchId,
          edit_id: editingBatchId ? null : editingId,
        });

        if (error) throw error;

        const savedRows = (data ?? []) as Array<{
          folio: number | null;
          created_at: string;
        }>;
        const folio = savedRows[0]?.folio ?? null;

        toast.success(
          editingId
            ? "Salida modificada y stock actualizado"
            : `Salida ${folioLabel("salida", folio)} registrada`,
        );

        if (print) {
          generarComprobanteSalida({
            folio,
            created_at: savedRows[0]?.created_at ?? new Date().toISOString(),
            unit_type: form.unit_type,
            unit_type_value: form.unit_type_value,
            document_number: form.document_number.trim(),
            master_name: form.reference.trim(),
            notes: form.notes.trim(),
            items: validItems.map((item) => {
              const product = products.find((p) => p.id === item.product_id);
              return {
                product_name: product?.name ?? item.search,
                product_sku: product?.sku ?? "—",
                quantity: item.quantity,
                unit: item.unit.trim(),
                unit_price: item.unit_price,
              };
            }),
          });
        }

        setFormOpen(false);
        setEditingId(null);
        setEditingBatchId(null);
        setForm({ ...emptyForm, type: "salida" });
        setPurchaseItems([newPurchaseItem()]);

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["movements"] }),
          queryClient.invalidateQueries({ queryKey: ["products"] }),
        ]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al registrar la salida");
      } finally {
        setSaving(false);
      }

      return;
    }

    if (!form.product_id) {
      toast.error("Selecciona un producto");
      return;
    }

    if (!form.quantity || form.quantity < 1 || !Number.isFinite(form.quantity)) {
      toast.error("La cantidad debe ser mayor a 0");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        product_id: form.product_id,
        type: form.type,
        quantity: form.quantity,
        supplier_id: form.type === "entrada" && form.supplier_id ? form.supplier_id : null,
        customer_id: null,
        unit_type: null,
        unit_type_value: null,
        reference: form.reference || null,
        notes: form.notes || null,
      };

      let saved;

      if (editingId) {
        const { data, error } = await supabase
          .from("stock_movements")
          .update(payload)
          .eq("id", editingId)
          .select()
          .single();

        if (error) throw error;

        saved = data;
        toast.success("Movimiento modificado");
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const { data, error } = await supabase
          .from("stock_movements")
          .insert({
            ...payload,
            created_by: user?.id ?? null,
          })
          .select()
          .single();

        if (error) throw error;

        saved = data;

        toast.success(
          `${form.type === "entrada" ? "Entrada" : "Salida"} ${folioLabel(
            data.type,
            data.folio,
          )} registrada`,
        );
      }

      if (print && saved) printMovement(saved);

      setFormOpen(false);
      setEditingId(null);
      setForm({ ...emptyForm, type: form.type });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["movements"] }),
        queryClient.invalidateQueries({ queryKey: ["products"] }),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelPurchase(purchase: (typeof purchases)[number]) {
    if (purchase.cancelled_at) {
      toast.error("Esta compra ya fue anulada");
      return;
    }

    const reason = window.prompt(
      `Indica el motivo para anular el documento ${purchase.document_number}:`,
    );

    if (reason === null) return;

    if (
      !window.confirm(
        `¿Confirmas la anulación de la compra ${purchase.document_number}? Esta operación descontará del stock las cantidades compradas.`,
      )
    ) {
      return;
    }

    setSaving(true);

    try {
      const { error } = await db.rpc("anular_compra", {
        p_purchase_entry_id: purchase.id,
        p_reason: reason.trim() || null,
      });

      if (error) throw error;

      toast.success("Compra anulada y stock actualizado");

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["purchase-entries"],
        }),
        queryClient.invalidateQueries({ queryKey: ["movements"] }),
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({
          queryKey: ["purchase-price-history"],
        }),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo anular la compra");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const { data: purchaseItem, error: lookupError } = await db
      .from("purchase_entry_items")
      .select("id")
      .eq("stock_movement_id", id)
      .maybeSingle();

    if (lookupError) {
      toast.error(lookupError.message);
      return;
    }

    // No permitir eliminar individualmente movimientos de compras.
    if (purchaseItem) {
      toast.error(
        "Este movimiento pertenece a una compra con varios productos. No lo elimines individualmente para evitar descuadrar la compra.",
      );
      return;
    }

    // Protección adicional para movimientos compensatorios de anulaciones.
    const { data: movement, error: movementError } = await db
      .from("stock_movements")
      .select("reference")
      .eq("id", id)
      .maybeSingle();

    if (movementError) {
      toast.error(movementError.message);
      return;
    }

    if (
      typeof movement?.reference === "string" &&
      movement.reference.startsWith("Anulación de compra:")
    ) {
      toast.error(
        "Este movimiento corresponde a una anulación de compra y no se puede eliminar individualmente.",
      );
      return;
    }

    if (!window.confirm("¿Eliminar este movimiento? El stock se revertirá.")) {
      return;
    }

    const { error } = await supabase.from("stock_movements").delete().eq("id", id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Movimiento eliminado y stock revertido");

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["movements"] }),
        queryClient.invalidateQueries({ queryKey: ["products"] }),
      ]);
    }
  }

  const hasFilters = filterType || filterFrom || filterTo;
  const isPurchaseForm = form.type === "entrada" && !editingId;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Movimientos</h1>
          <p className="text-sm text-muted-foreground">Entradas y salidas de stock</p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label">Tipo</label>
            <select
              className="input"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as "" | "entrada" | "salida")}
            >
              <option value="">Todos</option>
              <option value="entrada">Entradas</option>
              <option value="salida">Salidas</option>
            </select>
          </div>

          <div>
            <label className="label">Desde</label>
            <input
              type="date"
              className="input"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Hasta</label>
            <input
              type="date"
              className="input"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
            />
          </div>

          {hasFilters && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                setFilterType("");
                setFilterFrom("");
                setFilterTo("");
              }}
            >
              Limpiar
            </button>
          )}

          <button className="btn btn-primary" onClick={openNew}>
            <Plus className="h-4 w-4" /> Registrar movimiento
          </button>
        </div>
      </div>

      {/* Tabla de movimientos */}
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>N°</th>
              <th>Fecha</th>
              <th>Producto</th>
              <th>Tipo</th>
              <th>Cantidad</th>
              <th>Proveedor / Tipo de unidad</th>
              <th>Nombre maestro</th>
              <th className="w-28"></th>
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted-foreground">
                  Cargando…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted-foreground">
                  {hasFilters
                    ? "No hay movimientos con estos filtros."
                    : "No hay movimientos registrados."}
                </td>
              </tr>
            ) : (
              filtered.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap font-mono text-xs">
                    {folioLabel(m.type, m.folio)}
                  </td>

                  <td className="whitespace-nowrap text-muted-foreground">
                    {new Date(m.created_at).toLocaleString("es-CL", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>

                  <td className="font-medium">{m.products?.name ?? "—"}</td>

                  <td>
                    <span
                      className={`badge ${
                        m.type === "entrada" ? "badge-success" : "badge-destructive"
                      }`}
                    >
                      {m.type === "entrada" ? "Entrada" : "Salida"}
                    </span>
                  </td>

                  <td>
                    {m.quantity_value ?? m.quantity} {m.measure_unit ?? m.products?.unit ?? ""}
                  </td>

                  <td className="text-muted-foreground">
                    {m.type === "salida" ? (
                      <>
                        <div>
                          {m.unit_type
                            ? (UNIT_TYPE_LABELS[m.unit_type] ?? m.unit_type)
                            : (m.customers?.name ?? "—")}
                        </div>
                        {m.unit_type_value && <div className="text-xs">{m.unit_type_value}</div>}
                      </>
                    ) : (
                      (m.suppliers?.name ?? "—")
                    )}
                  </td>

                  <td className="text-muted-foreground">
                    <div>{m.reference ?? "—"}</div>
                    {m.type === "salida" && m.document_number && (
                      <div className="text-xs">Valor / Número: {m.document_number}</div>
                    )}
                  </td>

                  <td>
                    <div className="flex justify-end gap-1">
                      <button
                        className="btn btn-ghost p-1.5"
                        onClick={() => printMovement(m)}
                        aria-label="Imprimir"
                      >
                        <Printer className="h-4 w-4" />
                      </button>

                      <button
                        className="btn btn-ghost p-1.5"
                        onClick={() => openEdit(m)}
                        aria-label="Modificar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>

                      <button
                        className="btn btn-ghost p-1.5 text-destructive"
                        onClick={() => handleDelete(m.id)}
                        aria-label="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Historial de compras: fuera del formulario de movimientos */}
      <div className="card space-y-3 overflow-x-auto p-4">
        <div>
          <h2 className="text-lg font-bold">Compras y Ventas registradas</h2>
          <p className="text-sm text-muted-foreground">
            Consulta los documentos de compras y ventas.
          </p>
        </div>

        <table className="table-base">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Documento</th>
              <th>Orden de compra</th>
              <th>Estado</th>
              <th className="w-32">Acción</th>
            </tr>
          </thead>

          <tbody>
            {purchasesLoading ? (
              <tr>
                <td colSpan={5} className="py-6 text-center">
                  Cargando compras…
                </td>
              </tr>
            ) : purchases.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted-foreground">
                  No hay compras registradas.
                </td>
              </tr>
            ) : (
              purchases.map((purchase) => (
                <tr key={purchase.id}>
                  <td className="whitespace-nowrap">
                    {new Date(purchase.created_at).toLocaleDateString("es-CL")}
                  </td>

                  <td>
                    {purchase.document_type === "factura" ? "Factura" : "Guía de despacho"} N.º{" "}
                    {purchase.document_number}
                  </td>

                  <td>{purchase.purchase_order || "—"}</td>

                  <td>
                    {purchase.cancelled_at ? (
                      <span className="badge badge-destructive">Anulada</span>
                    ) : (
                      <span className="badge badge-success">Vigente</span>
                    )}

                    {purchase.cancelled_at && purchase.cancellation_reason && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Motivo: {purchase.cancellation_reason}
                      </p>
                    )}
                  </td>

                  <td>
                    {!purchase.cancelled_at && (
                      <button
                        type="button"
                        className="btn btn-ghost text-destructive"
                        disabled={saving}
                        onClick={() => handleCancelPurchase(purchase)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Anular
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Formulario de movimiento */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-foreground/40 p-4">
          <div className="card my-4 w-full max-w-4xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">
                {editingId
                  ? "Modificar movimiento"
                  : isPurchaseForm
                    ? "Registrar entrada de compra"
                    : form.type === "salida"
                      ? "Registrar salida"
                      : "Registrar movimiento"}
              </h2>

              <button
                className="btn btn-ghost p-1.5"
                onClick={() => setFormOpen(false)}
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                save(false);
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-2">
                {(["entrada", "salida"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={!!editingId}
                    className={`btn ${form.type === t ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => {
                      setForm({ ...form, type: t });

                      if (t === "entrada") {
                        setPurchaseItems([newPurchaseItem()]);
                      }
                    }}
                  >
                    {t === "entrada" ? "Entrada" : "Salida"}
                  </button>
                ))}
              </div>

              {isPurchaseForm ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="label">Proveedor</label>
                      <select
                        className="input"
                        value={form.supplier_id}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            supplier_id: e.target.value,
                          })
                        }
                      >
                        <option value="">Sin proveedor</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="label">Orden de compra</label>
                      <input
                        className="input"
                        value={purchaseOrder}
                        onChange={(e) => setPurchaseOrder(e.target.value)}
                        placeholder="Número de orden de compra"
                      />
                    </div>

                    <div>
                      <label className="label">Tipo de documento *</label>
                      <select
                        className="input"
                        value={documentType}
                        onChange={(e) =>
                          setDocumentType(e.target.value as "factura" | "guia_despacho")
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
                        onChange={(e) => setDocumentNumber(e.target.value)}
                        placeholder="Número de factura o guía"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold">Productos de la compra</h3>

                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setPurchaseItems((items) => [...items, newPurchaseItem()])}
                      >
                        <Plus className="h-4 w-4" />
                        Agregar producto
                      </button>
                    </div>

                    {purchaseItems.map((item, index) => {
                      const matches = products
                        .filter((p) => {
                          const term = item.search.trim().toLowerCase();

                          if (!term) return false;

                          return (
                            p.name.toLowerCase().includes(term) ||
                            (p.sku ?? "").toLowerCase().includes(term)
                          );
                        })
                        .slice(0, 8);

                      const history = item.product_id
                        ? (pricesByProduct[item.product_id] ?? [])
                        : [];

                      return (
                        <div key={item.key} className="space-y-3 rounded-lg border p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold">Producto {index + 1}</span>

                            <button
                              type="button"
                              className="btn btn-ghost p-1.5 text-destructive"
                              onClick={() => removePurchaseItem(item.key)}
                              aria-label="Quitar producto"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="relative">
                            <label className="label">Descripción *</label>

                            <input
                              className="input"
                              value={item.search}
                              placeholder="Escribe para buscar un producto..."
                              onChange={(e) =>
                                updatePurchaseItem(item.key, {
                                  search: e.target.value,
                                  product_id: "",
                                  unit_price: 0,
                                })
                              }
                              autoComplete="off"
                            />

                            {!item.product_id && matches.length > 0 && (
                              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-background shadow-lg">
                                {matches.map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                                    onClick={() => selectProduct(item.key, p.id)}
                                  >
                                    <span className="font-medium">{p.name}</span>

                                    <span className="block text-xs text-muted-foreground">
                                      SKU: {p.sku || "—"} · Stock: {p.stock ?? 0} {p.unit ?? ""}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}

                            {!item.product_id &&
                              item.search.trim() !== "" &&
                              matches.length === 0 && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  No se encontraron productos con esa descripción.
                                </p>
                              )}
                          </div>

                          {item.product_id && (
                            <div className="grid gap-3 sm:grid-cols-3">
                              <div>
                                <label className="label">Cantidad *</label>
                                <input
                                  className="input"
                                  type="number"
                                  min="0.001"
                                  step="0.001"
                                  value={item.quantity}
                                  onChange={(e) =>
                                    updatePurchaseItem(item.key, {
                                      quantity: Number(e.target.value),
                                    })
                                  }
                                  required
                                />
                              </div>

                              <div>
                                <label className="label">Unidad de medida *</label>
                                <input
                                  className="input"
                                  value={item.unit}
                                  onChange={(e) =>
                                    updatePurchaseItem(item.key, {
                                      unit: e.target.value,
                                    })
                                  }
                                  placeholder="Ej. unidad, caja, litro"
                                  required
                                />
                              </div>

                              <div>
                                <label className="label">Precio unitario *</label>
                                <input
                                  className="input"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={item.unit_price}
                                  onChange={(e) =>
                                    updatePurchaseItem(item.key, {
                                      unit_price: Number(e.target.value),
                                    })
                                  }
                                  required
                                />
                              </div>
                            </div>
                          )}

                          {item.product_id && (
                            <div className="rounded-md bg-muted/50 p-3">
                              <p className="mb-2 text-sm font-semibold">Historial de precios</p>

                              {history.length > 0 ? (
                                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                                  {history.map((price, priceIndex) => (
                                    <span key={`${price.created_at}-${priceIndex}`}>
                                      <span className="text-muted-foreground">
                                        {priceIndex === 0
                                          ? "Último"
                                          : priceIndex === 1
                                            ? "Anterior"
                                            : "Hace 2 compras"}
                                        :
                                      </span>{" "}
                                      <strong>{formatMoney(price.unit_price)}</strong>
                                      <span className="text-muted-foreground">
                                        {" "}
                                        ({new Date(price.created_at).toLocaleDateString("es-CL")})
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  No hay compras anteriores registradas para este producto.
                                </p>
                              )}

                              <p className="mt-2 text-sm">
                                Subtotal:{" "}
                                <strong>{formatMoney(item.quantity * item.unit_price)}</strong>
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <div className="flex justify-end rounded-lg border p-3">
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Total de la compra</p>
                        <p className="text-xl font-bold">{formatMoney(purchaseTotal)}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="label">Observaciones</label>
                    <textarea
                      className="input"
                      rows={2}
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      placeholder="Observaciones de la compra"
                    />
                  </div>
                </>
              ) : form.type === "salida" ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <label className="label">Tipo de unidad *</label>
                      <select
                        className="input"
                        value={form.unit_type}
                        onChange={(e) => setForm({ ...form, unit_type: e.target.value })}
                      >
                        {Object.entries(UNIT_TYPE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="label">Valor / Número</label>
                      <input
                        className="input"
                        value={form.document_number}
                        onChange={(e) => setForm({ ...form, document_number: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="label">UNIDADES</label>
                      <select
                        className="input"
                        value={form.unit_type_value}
                        onChange={(e) => setForm({ ...form, unit_type_value: e.target.value })}
                      >
                        <option value="">Selecciona una unidad…</option>
                        {UNIDADES.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="label">Nombre maestro</label>
                      <input
                        className="input"
                        value={form.reference}
                        onChange={(e) => setForm({ ...form, reference: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold">Productos de la salida</h3>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setPurchaseItems((items) => [...items, newPurchaseItem()])}
                      >
                        <Plus className="h-4 w-4" />
                        Agregar producto
                      </button>
                    </div>

                    {purchaseItems.map((item, index) => {
                      const term = item.search.trim().toLowerCase();
                      const matches = products
                        .filter(
                          (product) =>
                            term &&
                            (product.name.toLowerCase().includes(term) ||
                              (product.sku ?? "").toLowerCase().includes(term)),
                        )
                        .slice(0, 8);
                      const isListedUnit = UNITS.includes(item.unit as (typeof UNITS)[number]);
                      const useCustomUnit = item.unitIsOther || !isListedUnit;

                      return (
                        <div key={item.key} className="space-y-3 rounded-lg border p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold">Producto {index + 1}</span>
                            <button
                              type="button"
                              className="btn btn-ghost p-1.5 text-destructive"
                              onClick={() => removePurchaseItem(item.key)}
                              aria-label={`Quitar producto ${index + 1}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="relative">
                            <label className="label">Descripción *</label>
                            <input
                              className="input"
                              value={item.search}
                              placeholder="Escribe para buscar un producto..."
                              autoComplete="off"
                              onChange={(e) =>
                                updatePurchaseItem(item.key, {
                                  search: e.target.value,
                                  product_id: "",
                                  unit_price: 0,
                                })
                              }
                            />
                            {!item.product_id && matches.length > 0 && (
                              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-background shadow-lg">
                                {matches.map((product) => (
                                  <button
                                    key={product.id}
                                    type="button"
                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                                    onClick={() => selectProduct(item.key, product.id)}
                                  >
                                    <span className="font-medium">{product.name}</span>
                                    <span className="block text-xs text-muted-foreground">
                                      SKU: {product.sku || "—"} · Stock: {product.stock ?? 0}{" "}
                                      {product.unit ?? ""}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                            {item.product_id && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                SKU:{" "}
                                {products.find((product) => product.id === item.product_id)?.sku ??
                                  "—"}
                              </p>
                            )}
                          </div>

                          {item.product_id && (
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                              <div>
                                <label className="label">Cantidad *</label>
                                <input
                                  className="input"
                                  type="number"
                                  min="0.001"
                                  step="0.001"
                                  value={item.quantity}
                                  onChange={(e) =>
                                    updatePurchaseItem(item.key, {
                                      quantity: Number(e.target.value),
                                    })
                                  }
                                  required
                                />
                              </div>

                              <div>
                                <label className="label">Unidad de medida *</label>
                                <select
                                  className="input"
                                  value={useCustomUnit ? "Otra" : item.unit}
                                  onChange={(e) => {
                                    if (e.target.value === "Otra") {
                                      updatePurchaseItem(item.key, { unitIsOther: true });
                                    } else {
                                      updatePurchaseItem(item.key, {
                                        unit: e.target.value,
                                        unitIsOther: false,
                                      });
                                    }
                                  }}
                                >
                                  {UNITS.map((unit) => (
                                    <option key={unit} value={unit}>
                                      {unit}
                                    </option>
                                  ))}
                                  <option value="Otra">Otra...</option>
                                </select>
                                {useCustomUnit && (
                                  <input
                                    className="input mt-1"
                                    value={item.unit}
                                    placeholder="Escribe la unidad"
                                    onChange={(e) =>
                                      updatePurchaseItem(item.key, {
                                        unit: e.target.value,
                                        unitIsOther: true,
                                      })
                                    }
                                    required
                                  />
                                )}
                              </div>

                              <div>
                                <label className="label">Costo unitario *</label>
                                <input
                                  className="input"
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={item.unit_price}
                                  onChange={(e) =>
                                    updatePurchaseItem(item.key, {
                                      unit_price: Number(e.target.value),
                                    })
                                  }
                                  required
                                />
                              </div>

                              <div className="flex flex-col justify-end">
                                <span className="label">Total</span>
                                <p className="py-2 font-semibold">
                                  {formatMoney(item.quantity * item.unit_price)}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <div className="flex justify-end rounded-lg border p-3">
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Total de la salida</p>
                        <p className="text-xl font-bold">{formatMoney(exitTotal)}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="label">Observaciones</label>
                    <textarea
                      className="input"
                      rows={2}
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="label">Producto *</label>
                    <select
                      className="input"
                      value={form.product_id}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          product_id: e.target.value,
                        })
                      }
                      required
                    >
                      <option value="">Selecciona un producto…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku}) — stock: {p.stock}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label">Cantidad *</label>
                    <input
                      type="number"
                      min={1}
                      className="input"
                      value={form.quantity}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          quantity: Number(e.target.value),
                        })
                      }
                      required
                    />
                  </div>

                  {form.type === "entrada" ? (
                    <div>
                      <label className="label">Proveedor</label>
                      <select
                        className="input"
                        value={form.supplier_id}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            supplier_id: e.target.value,
                          })
                        }
                      >
                        <option value="">Sin proveedor</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="label">Tipo de unidad *</label>
                        <select
                          className="input"
                          value={form.unit_type}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              unit_type: e.target.value,
                            })
                          }
                        >
                          {Object.entries(UNIT_TYPE_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label">UNIDADES</label>
                        <select
                          className="input"
                          value={form.unit_type_value}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              unit_type_value: e.target.value,
                            })
                          }
                        >
                          <option value="">Selecciona una unidad…</option>
                          {UNIDADES.map((unit) => (
                            <option key={unit} value={unit}>
                              {unit}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="label">Observaciones</label>
                    <textarea
                      className="input"
                      rows={2}
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    />
                  </div>
                </>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setFormOpen(false)}
                  disabled={saving}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={saving}
                  onClick={() => save(true)}
                >
                  <Printer className="h-4 w-4" />
                  {saving ? "Guardando…" : "Registrar e imprimir"}
                </button>

                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
