import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Eye, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  UNIT_TYPE_LABELS,
  folioLabel,
  generarComprobante,
  generarComprobanteCompra,
  generarComprobanteSalida,
} from "@/lib/comprobante-pdf";
import { UNIDADES, UNITS } from "@/lib/warehouse";
import { hasPermission, useAppAccess } from "@/lib/permissions";

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
  customer_id: string;
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
  cancelled_at: string | null;
  cancellation_reason: string | null;
};
type PurchaseEntryLink = {
  purchase_entry_id: string;
  stock_movement_id: string;
};
type PurchaseEntryItem = {
  stock_movement_id: string | null;
  product_id: string;
  quantity: number;
  unit: string;
  unit_price: number;
};
type SaleCancellation = {
  stock_movement_id: string;
  cancelled_at: string;
  cancellation_reason: string | null;
};
type RegisteredDocumentMovement = {
  id: string;
  created_at: string;
  type: "entrada" | "salida";
  batch_id: string | null;
  supplier_id: string | null;
  customer_id: string | null;
  document_type: string | null;
  document_number: string | null;
  purchase_order: string | null;
  notes: string | null;
};
type RegisteredDocument = {
  id: string;
  movement_ids: string[];
  created_at: string;
  type: "entrada" | "salida";
  document_type: string | null;
  document_number: string;
  purchase_order: string | null;
  supplier_id: string | null;
  customer_id: string | null;
  purchase_entry_id: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
};
type PurchaseDocumentFilter = "" | "factura" | "guia_despacho";
type PurchaseStatusFilter = "" | "vigente" | "anulada";
type PurchaseOperationFilter = "" | "entrada" | "salida";

const emptyForm: FormState = {
  product_id: "",
  type: "entrada",
  quantity: 1,
  supplier_id: "",
  customer_id: "",
  unit_type: "stock",
  unit_type_value: "",
  document_number: "",
  reference: "",
  notes: "",
};

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

function getMovementErrorMessage(error: unknown, fallback: string) {
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

function MovimientosPage() {
  const access = useAppAccess();
  const canCreate = hasPermission(access?.name, access?.permissions, "movements", "create");
  const canEdit = hasPermission(access?.name, access?.permissions, "movements", "edit");
  const canDelete = hasPermission(access?.name, access?.permissions, "movements", "delete");
  const canEditPurchases = hasPermission(access?.name, access?.permissions, "purchases", "edit");
  const canDeletePurchases = hasPermission(
    access?.name,
    access?.permissions,
    "purchases",
    "delete",
  );
  const queryClient = useQueryClient();
  const db = supabase as any;

  const [formOpen, setFormOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editingPurchaseEntryId, setEditingPurchaseEntryId] = useState<string | null>(null);
  const [editingRegisteredMovementIds, setEditingRegisteredMovementIds] = useState<string[] | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([newPurchaseItem()]);
  const [purchaseOrder, setPurchaseOrder] = useState("");
  const [documentType, setDocumentType] = useState<"factura" | "guia_despacho">("factura");
  const [documentNumber, setDocumentNumber] = useState("");
  const [filterType, setFilterType] = useState<"" | "entrada" | "salida">("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [purchaseSearch, setPurchaseSearch] = useState("");
  const [purchaseOperationFilter, setPurchaseOperationFilter] =
    useState<PurchaseOperationFilter>("");
  const [purchaseDocumentFilter, setPurchaseDocumentFilter] = useState<PurchaseDocumentFilter>("");
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState<PurchaseStatusFilter>("");

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
        .select("*, products(name, sku, unit, unit_cost)")
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
      const { data, error } = await supabase
        .from("supplier_directory")
        .select("id, name")
        .order("name");

      if (error) throw error;
      return data;
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_directory")
        .select("id, name")
        .order("name");

      if (error) throw error;
      return data;
    },
  });

  const {
    data: purchases = [],
    isLoading: purchaseEntriesLoading,
    isError: purchaseEntriesError,
  } = useQuery<PurchaseEntry[]>({
    queryKey: ["purchase-entries"],
    queryFn: async () => {
      const { data, error } = await db
        .from("purchase_entries")
        .select("id, cancelled_at, cancellation_reason");

      if (error) throw error;
      return data ?? [];
    },
  });

  const {
    data: purchaseEntryLinks = [],
    isLoading: purchaseEntryLinksLoading,
    isError: purchaseEntryLinksError,
  } = useQuery<PurchaseEntryLink[]>({
    queryKey: ["purchase-entry-movement-links"],
    queryFn: async () => {
      const { data, error } = await db
        .from("purchase_entry_items")
        .select("purchase_entry_id, stock_movement_id")
        .not("stock_movement_id", "is", null);

      if (error) throw error;
      return data ?? [];
    },
  });

  const {
    data: saleCancellations = [],
    isLoading: saleCancellationsLoading,
    isError: saleCancellationsError,
  } = useQuery<SaleCancellation[]>({
    queryKey: ["sale-document-cancellations"],
    queryFn: async () => {
      const { data, error } = await db
        .from("stock_movement_document_cancellations")
        .select("stock_movement_id, cancelled_at, cancellation_reason");

      if (error) throw error;
      return data ?? [];
    },
  });

  const {
    data: registeredDocumentMovements = [],
    isLoading: registeredDocumentMovementsLoading,
    isError: registeredDocumentMovementsError,
  } = useQuery<RegisteredDocumentMovement[]>({
    queryKey: ["registered-document-movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select(
          "id, created_at, type, batch_id, supplier_id, customer_id, document_type, document_number, purchase_order, notes",
        )
        .not("document_number", "is", null)
        .order("created_at", { ascending: false })
        .limit(2000);

      if (error) throw error;
      return data ?? [];
    },
  });

  const purchasesLoading =
    purchaseEntriesLoading ||
    purchaseEntryLinksLoading ||
    saleCancellationsLoading ||
    registeredDocumentMovementsLoading;
  const registeredDocumentsError =
    purchaseEntriesError ||
    purchaseEntryLinksError ||
    saleCancellationsError ||
    registeredDocumentMovementsError;

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

  const filteredPurchases = useMemo(() => {
    const term = purchaseSearch.trim().toLocaleLowerCase("es-CL");
    const linksByMovement = new Map(
      purchaseEntryLinks.map((link) => [link.stock_movement_id, link.purchase_entry_id]),
    );
    const entriesById = new Map(purchases.map((purchase) => [purchase.id, purchase]));
    const salesCancelledByMovement = new Map(
      saleCancellations.map((cancellation) => [cancellation.stock_movement_id, cancellation]),
    );
    const documents = new Map<string, RegisteredDocument>();

    for (const movement of registeredDocumentMovements) {
      const documentNumber = movement.document_number?.trim();
      if (!documentNumber) continue;

      const entityId = movement.type === "entrada" ? movement.supplier_id : movement.customer_id;
      const fallbackKey = [
        movement.type,
        movement.document_type ?? "",
        documentNumber.toLocaleLowerCase("es-CL"),
        movement.purchase_order ?? "",
        entityId ?? "",
        movement.created_at.slice(0, 10),
      ].join(":");
      const key = movement.batch_id ?? fallbackKey;
      const purchaseEntryId = linksByMovement.get(movement.id) ?? null;
      const purchaseEntry = purchaseEntryId ? entriesById.get(purchaseEntryId) : undefined;
      const saleCancellation = salesCancelledByMovement.get(movement.id);
      const existing = documents.get(key);

      if (existing) {
        existing.movement_ids.push(movement.id);
        if (!existing.purchase_entry_id && purchaseEntryId) {
          existing.purchase_entry_id = purchaseEntryId;
          existing.cancelled_at = purchaseEntry?.cancelled_at ?? null;
          existing.cancellation_reason = purchaseEntry?.cancellation_reason ?? null;
        }
        if (!existing.cancelled_at && saleCancellation) {
          existing.cancelled_at = saleCancellation.cancelled_at;
          existing.cancellation_reason = saleCancellation.cancellation_reason;
        }
        continue;
      }

      documents.set(key, {
        id: key,
        movement_ids: [movement.id],
        created_at: movement.created_at,
        type: movement.type,
        document_type: movement.document_type,
        document_number: documentNumber,
        purchase_order: movement.purchase_order,
        supplier_id: movement.supplier_id,
        customer_id: movement.customer_id,
        purchase_entry_id: purchaseEntryId,
        cancelled_at: purchaseEntry?.cancelled_at ?? saleCancellation?.cancelled_at ?? null,
        cancellation_reason:
          purchaseEntry?.cancellation_reason ?? saleCancellation?.cancellation_reason ?? null,
      });
    }

    return Array.from(documents.values()).filter((purchase) => {
      const isCancelled = Boolean(purchase.cancelled_at);
      const matchesOperation =
        !purchaseOperationFilter || purchase.type === purchaseOperationFilter;
      const matchesDocumentType =
        !purchaseDocumentFilter || purchase.document_type === purchaseDocumentFilter;
      const matchesStatus =
        !purchaseStatusFilter || (purchaseStatusFilter === "anulada" ? isCancelled : !isCancelled);
      const matchesSearch =
        !term ||
        purchase.document_number.toLocaleLowerCase("es-CL").includes(term) ||
        (purchase.purchase_order ?? "").toLocaleLowerCase("es-CL").includes(term) ||
        (purchase.type === "entrada"
          ? (suppliers.find((supplier) => supplier.id === purchase.supplier_id)?.name ?? "")
          : (customers.find((customer) => customer.id === purchase.customer_id)?.name ?? "")
        )
          .toLocaleLowerCase("es-CL")
          .includes(term);

      return matchesOperation && matchesDocumentType && matchesStatus && matchesSearch;
    });
  }, [
    customers,
    purchaseOperationFilter,
    purchaseDocumentFilter,
    purchaseEntryLinks,
    purchaseSearch,
    purchaseStatusFilter,
    purchases,
    registeredDocumentMovements,
    saleCancellations,
    suppliers,
  ]);

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
    id: string;
    folio: number | null;
    type: "entrada" | "salida";
    created_at: string;
    product_id: string;
    quantity: number;
    unit_type: string | null;
    unit_type_value: string | null;
    document_number: string | null;
    supplier_id: string | null;
    customer_id: string | null;
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
      master_name: customers.find((customer) => customer.id === m.customer_id)?.name ?? m.reference,
      notes: m.notes,
    });
  }

  function openNew() {
    setEditingId(null);
    setEditingBatchId(null);
    setEditingPurchaseEntryId(null);
    setEditingRegisteredMovementIds(null);
    setForm(emptyForm);
    setPurchaseItems([newPurchaseItem()]);
    setPurchaseOrder("");
    setDocumentType("factura");
    setDocumentNumber("");
    setFormOpen(true);
  }

  function openEdit(m: Movement, relatedMovements: Movement[] = movements) {
    if (
      m.type === "entrada" &&
      purchaseEntryLinks.some((link) => link.stock_movement_id === m.id)
    ) {
      toast.error("Edita esta entrada desde Compras y Ventas registradas");
      return;
    }

    setEditingId(m.id);
    setEditingBatchId(m.batch_id);
    setEditingPurchaseEntryId(null);
    setEditingRegisteredMovementIds(null);
    setDocumentType(m.document_type === "guia_despacho" ? "guia_despacho" : "factura");
    setDocumentNumber(m.document_number ?? "");
    setPurchaseOrder(m.purchase_order ?? "");
    setForm({
      product_id: m.product_id,
      type: m.type,
      quantity: m.quantity,
      supplier_id: m.supplier_id ?? "",
      customer_id: m.customer_id ?? "",
      unit_type: m.unit_type ?? "stock",
      unit_type_value: m.unit_type_value ?? "",
      document_number: m.document_number ?? "",
      reference: m.reference ?? "",
      notes: m.notes ?? "",
    });
    if (m.type === "salida") {
      const batchMovements = m.batch_id
        ? relatedMovements.filter((movement) => movement.batch_id === m.batch_id)
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

  async function openEditRegisteredDocument(document: RegisteredDocument) {
    if (document.cancelled_at) {
      toast.error("No se puede editar un documento anulado");
      return;
    }

    if (document.type === "entrada" && !document.purchase_entry_id) {
      if (!canEditPurchases) {
        toast.error("No tienes permiso para editar compras");
        return;
      }

      setSaving(true);
      try {
        const { data, error } = await db
          .from("stock_movements")
          .select("*, products(name, sku, unit, unit_cost)")
          .in("id", document.movement_ids)
          .order("created_at", { ascending: true });

        if (error) throw error;
        const rows = (data ?? []) as Movement[];
        const firstRow = rows[0];
        if (!firstRow || rows.length !== document.movement_ids.length) {
          throw new Error("No se pudieron cargar todas las líneas de la compra");
        }

        setEditingId(firstRow.id);
        setEditingBatchId(null);
        setEditingPurchaseEntryId(null);
        setEditingRegisteredMovementIds(document.movement_ids);
        setForm({
          ...emptyForm,
          type: "entrada",
          supplier_id: document.supplier_id ?? "",
          notes: firstRow.notes ?? "",
        });
        setPurchaseItems(
          rows.map((movement) => {
            const product = products.find((item) => item.id === movement.product_id);
            const unit = movement.measure_unit ?? product?.unit ?? "unidad";
            return {
              key: movement.id,
              id: movement.id,
              product_id: movement.product_id,
              search: product?.name ?? movement.products?.name ?? "",
              quantity: Number(movement.quantity_value ?? movement.quantity),
              unit,
              unitIsOther: !UNITS.includes(unit as (typeof UNITS)[number]),
              unit_price: movement.unit_cost ?? product?.unit_cost ?? 0,
            };
          }),
        );
        setPurchaseOrder(document.purchase_order ?? "");
        setDocumentType(document.document_type === "guia_despacho" ? "guia_despacho" : "factura");
        setDocumentNumber(document.document_number);
        setFormOpen(true);
      } catch (err) {
        toast.error(getMovementErrorMessage(err, "No se pudo cargar la compra para editar"));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (document.type === "entrada") {
      if (!document.purchase_entry_id) {
        toast.error("Esta compra no está vinculada a un registro editable");
        return;
      }

      setSaving(true);
      try {
        const { data, error } = await db
          .from("purchase_entry_items")
          .select("stock_movement_id, product_id, quantity, unit, unit_price")
          .eq("purchase_entry_id", document.purchase_entry_id)
          .order("created_at");

        if (error) throw error;
        const items = (data ?? []) as PurchaseEntryItem[];
        if (items.length === 0 || items.some((item) => !item.stock_movement_id)) {
          throw new Error("La compra no tiene líneas vinculadas al stock que se puedan editar");
        }
        const firstItem = items[0];
        if (!firstItem?.stock_movement_id) {
          throw new Error("La compra no tiene líneas vinculadas al stock que se puedan editar");
        }

        const firstMovement = registeredDocumentMovements.find((movement) =>
          items.some((item) => item.stock_movement_id === movement.id),
        );
        const entryItems = items.map((item) => {
          if (!item.stock_movement_id) {
            throw new Error("La compra contiene una línea sin movimiento de stock");
          }
          const product = products.find((current) => current.id === item.product_id);
          const unit = item.unit || product?.unit || "unidad";
          return {
            key: item.stock_movement_id,
            id: item.stock_movement_id,
            product_id: item.product_id,
            search: product?.name ?? "",
            quantity: Number(item.quantity),
            unit,
            unitIsOther: !UNITS.includes(unit as (typeof UNITS)[number]),
            unit_price: Number(item.unit_price),
          };
        });

        setEditingId(firstItem.stock_movement_id);
        setEditingBatchId(null);
        setEditingPurchaseEntryId(document.purchase_entry_id);
        setEditingRegisteredMovementIds(null);
        setForm({
          ...emptyForm,
          type: "entrada",
          supplier_id: document.supplier_id ?? "",
          notes: firstMovement?.notes ?? "",
        });
        setPurchaseItems(entryItems);
        setPurchaseOrder(document.purchase_order ?? "");
        setDocumentType(document.document_type === "guia_despacho" ? "guia_despacho" : "factura");
        setDocumentNumber(document.document_number);
        setFormOpen(true);
      } catch (err) {
        toast.error(getMovementErrorMessage(err, "No se pudo cargar la compra para editar"));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!canEdit) {
      toast.error("No tienes permiso para editar ventas");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await db
        .from("stock_movements")
        .select("*, products(name, sku, unit, unit_cost)")
        .in("id", document.movement_ids)
        .order("created_at", { ascending: true });

      if (error) throw error;
      if (!data?.length || data.length !== document.movement_ids.length) {
        throw new Error("No se pudieron cargar todas las líneas de la venta");
      }

      openEdit(data[0] as Movement, data as Movement[]);
      setEditingRegisteredMovementIds(document.movement_ids);
    } catch (err) {
      toast.error(getMovementErrorMessage(err, "No se pudo cargar la venta para editar"));
    } finally {
      setSaving(false);
    }
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
    if (form.type === "entrada" && editingRegisteredMovementIds) {
      const validItems = purchaseItems.filter((item) => item.product_id);

      if (validItems.length === 0) {
        toast.error("Agrega al menos un producto a la compra");
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
        toast.error("Revisa los precios de los productos");
        return;
      }
      if (!documentNumber.trim()) {
        toast.error("Ingresa el número de factura o guía de despacho");
        return;
      }

      setSaving(true);
      try {
        const { error } = await db.rpc("editar_entrada_documento", {
          p_movement_ids: editingRegisteredMovementIds,
          p_payload: {
            supplier_id: form.supplier_id || null,
            notes: form.notes.trim() || null,
            purchase_order: purchaseOrder.trim() || null,
            document_type: documentType,
            document_number: documentNumber.trim(),
            lines: validItems.map((item) => ({
              ...(item.id ? { id: item.id } : {}),
              product_id: item.product_id,
              quantity: item.quantity,
              measure_unit: item.unit.trim(),
              unit_cost: item.unit_price,
            })),
          },
        });
        if (error) throw error;

        if (print) {
          generarComprobanteCompra({
            id: editingRegisteredMovementIds[0] ?? documentNumber.trim(),
            created_at: new Date().toISOString(),
            supplier:
              suppliers.find((supplier) => supplier.id === form.supplier_id)?.name ??
              "Sin proveedor",
            purchase_order: purchaseOrder.trim(),
            document_type: documentType,
            document_number: documentNumber.trim(),
            notes: form.notes.trim(),
            items: validItems.map((item) => {
              const product = products.find((current) => current.id === item.product_id);
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

        toast.success("Compra modificada y stock actualizado");
        setPreviewOpen(false);
        setFormOpen(false);
        setEditingId(null);
        setEditingRegisteredMovementIds(null);
        setForm(emptyForm);
        setPurchaseItems([newPurchaseItem()]);
        setPurchaseOrder("");
        setDocumentType("factura");
        setDocumentNumber("");

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["movements"] }),
          queryClient.invalidateQueries({ queryKey: ["products"] }),
          queryClient.invalidateQueries({ queryKey: ["registered-document-movements"] }),
          queryClient.invalidateQueries({ queryKey: ["purchase-price-history"] }),
        ]);
      } catch (err) {
        toast.error(getMovementErrorMessage(err, "No se pudo modificar la compra"));
      } finally {
        setSaving(false);
      }
      return;
    }

    const isEditingPurchase = form.type === "entrada" && Boolean(editingPurchaseEntryId);
    const isNewPurchase = form.type === "entrada" && !editingId && !editingPurchaseEntryId;

    if (isNewPurchase || isEditingPurchase) {
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
          ...(isEditingPurchase && item.id ? { id: item.id } : {}),
          product_id: item.product_id,
          quantity: item.quantity,
          unit: item.unit.trim() || "unidad",
          unit_price: item.unit_price,
        }));

        const { data, error } = isEditingPurchase
          ? await db.rpc("editar_entrada_compra", {
              p_purchase_entry_id: editingPurchaseEntryId,
              p_supplier_id: form.supplier_id || null,
              p_purchase_order: purchaseOrder.trim() || null,
              p_document_type: documentType,
              p_document_number: documentNumber.trim(),
              p_notes: form.notes.trim() || null,
              p_items: itemsPayload,
            })
          : await db.rpc("registrar_entrada_compra", {
              p_supplier_id: form.supplier_id || null,
              p_purchase_order: purchaseOrder.trim() || null,
              p_document_type: documentType,
              p_document_number: documentNumber.trim(),
              p_notes: form.notes.trim() || null,
              p_items: itemsPayload,
            });

        if (error) throw error;

        const purchaseId = isEditingPurchase ? editingPurchaseEntryId! : String(data);
        const supplierName =
          suppliers.find((s) => s.id === form.supplier_id)?.name ?? "Sin proveedor";

        toast.success(
          isEditingPurchase
            ? "Compra modificada y stock actualizado"
            : "Compra registrada y stock actualizado",
        );

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

        setPreviewOpen(false);
        setFormOpen(false);
        setEditingId(null);
        setEditingBatchId(null);
        setEditingPurchaseEntryId(null);
        setEditingRegisteredMovementIds(null);
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
          queryClient.invalidateQueries({
            queryKey: ["registered-document-movements"],
          }),
          queryClient.invalidateQueries({
            queryKey: ["purchase-entry-movement-links"],
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
        const selectedMaster = customers.find((customer) => customer.id === form.customer_id);
        const payload = {
          type: "salida",
          supplier_id: null,
          customer_id: form.customer_id || null,
          reference: selectedMaster?.name ?? (form.reference.trim() || null),
          notes: form.notes.trim() || null,
          unit_type: form.unit_type,
          unit_type_value: form.unit_type_value || null,
          purchase_order: editingId ? purchaseOrder.trim() || null : null,
          document_type: editingId ? documentType : null,
          document_number: form.document_number.trim() || null,
          lines: validItems.map((item) => ({
            ...(item.id ? { id: item.id } : {}),
            product_id: item.product_id,
            quantity: item.quantity,
            measure_unit: item.unit.trim(),
            unit_cost: item.unit_price,
          })),
        };
        const { data, error } = editingRegisteredMovementIds
          ? await db.rpc("editar_salida_documento", {
              p_movement_ids: editingRegisteredMovementIds,
              p_payload: payload,
            })
          : await db.rpc("save_movement_batch", {
              payload,
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
          editingRegisteredMovementIds || editingId
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
            master_name: selectedMaster?.name ?? form.reference.trim(),
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

        setPreviewOpen(false);
        setFormOpen(false);
        setEditingId(null);
        setEditingBatchId(null);
        setEditingPurchaseEntryId(null);
        setEditingRegisteredMovementIds(null);
        setForm({ ...emptyForm, type: "salida" });
        setPurchaseItems([newPurchaseItem()]);

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["movements"] }),
          queryClient.invalidateQueries({ queryKey: ["products"] }),
          queryClient.invalidateQueries({ queryKey: ["registered-document-movements"] }),
        ]);
      } catch (err) {
        toast.error(getMovementErrorMessage(err, "Error al registrar la salida"));
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

      setPreviewOpen(false);
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

  async function handleCancelPurchase(purchase: RegisteredDocument) {
    if (purchase.type === "salida") {
      if (!canDelete) {
        toast.error("No tienes permiso para anular ventas");
        return;
      }
      if (purchase.cancelled_at) {
        toast.error("Esta venta ya fue anulada");
        return;
      }

      const reason = window.prompt(
        `Indica el motivo para anular el documento ${purchase.document_number}:`,
      );
      if (reason === null) return;
      if (
        !window.confirm(
          `¿Confirmas la anulación de la venta ${purchase.document_number}? Se repondrán las cantidades al stock.`,
        )
      ) {
        return;
      }

      setSaving(true);
      try {
        const { error } = await db.rpc("anular_salida_documento", {
          p_movement_ids: purchase.movement_ids,
          p_reason: reason.trim() || null,
        });
        if (error) throw error;

        toast.success("Venta anulada y stock repuesto");
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["sale-document-cancellations"] }),
          queryClient.invalidateQueries({ queryKey: ["registered-document-movements"] }),
          queryClient.invalidateQueries({ queryKey: ["movements"] }),
          queryClient.invalidateQueries({ queryKey: ["products"] }),
        ]);
      } catch (err) {
        toast.error(getMovementErrorMessage(err, "No se pudo anular la venta"));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!canDeletePurchases) {
      toast.error("No tienes permiso para anular compras");
      return;
    }
    if (purchase.type !== "entrada") {
      toast.error("Este documento no es una compra");
      return;
    }
    if (purchase.cancelled_at) {
      toast.error("Esta compra ya fue anulada");
      return;
    }
    const isUnlinked = !purchase.purchase_entry_id;

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
      const { error } = isUnlinked
        ? await db.rpc("anular_entrada_documento", {
            p_movement_ids: purchase.movement_ids,
            p_reason: reason.trim() || null,
          })
        : await db.rpc("anular_compra", {
            p_purchase_entry_id: purchase.purchase_entry_id,
            p_reason: reason.trim() || null,
          });

      if (error) throw error;

      toast.success("Compra anulada y stock actualizado");

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sale-document-cancellations"] }),
        queryClient.invalidateQueries({
          queryKey: ["purchase-entries"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["registered-document-movements"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["purchase-entry-movement-links"],
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
      .select("reference, document_number")
      .eq("id", id)
      .maybeSingle();

    if (movementError) {
      toast.error(movementError.message);
      return;
    }

    if (movement?.document_number) {
      toast.error("Anula el documento completo desde Compras y Ventas registradas");
      return;
    }

    if (
      typeof movement?.reference === "string" &&
      (movement.reference.startsWith("Anulación de compra:") ||
        movement.reference.startsWith("Anulación de venta:"))
    ) {
      toast.error(
        "Este movimiento corresponde a una anulación y no se puede eliminar individualmente.",
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
  const isPurchaseForm =
    form.type === "entrada" &&
    (!editingId || Boolean(editingPurchaseEntryId) || Boolean(editingRegisteredMovementIds));
  const previewItems =
    isPurchaseForm || form.type === "salida"
      ? purchaseItems
          .filter((item) => item.product_id)
          .map((item) => {
            const product = products.find((current) => current.id === item.product_id);
            return {
              key: item.key,
              name: product?.name ?? item.search,
              sku: product?.sku ?? "—",
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unit_price,
            };
          })
      : form.product_id
        ? (() => {
            const product = products.find((current) => current.id === form.product_id);
            return [
              {
                key: form.product_id,
                name: product?.name ?? "Producto",
                sku: product?.sku ?? "—",
                quantity: form.quantity,
                unit: product?.unit ?? "unidad",
                unitPrice: Number(product?.unit_cost) || 0,
              },
            ];
          })()
        : [];
  const previewTotal = previewItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const previewTitle = isPurchaseForm
    ? "Vista previa · Entrada de compra"
    : form.type === "salida"
      ? "Vista previa · Salida"
      : "Vista previa · Entrada";
  const previewSupplier =
    suppliers.find((supplier) => supplier.id === form.supplier_id)?.name ?? "Sin proveedor";
  const customerName = customers.find((customer) => customer.id === form.customer_id)?.name;
  const previewCustomer = customerName || form.reference.trim() || "—";

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

          {canCreate && (
            <button className="btn btn-primary" onClick={openNew}>
              <Plus className="h-4 w-4" /> Registrar movimiento
            </button>
          )}
        </div>
      </div>

      {/* Tabla de movimientos */}
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>N°</th>
              <th>Fecha</th>
              <th>Descripción</th>
              <th>Tipo</th>
              <th>Cantidad</th>
              <th>Valor total</th>
              <th>Proveedor / Tipo de unidad</th>
              <th>OC / Nombre maestro</th>
              <th className="w-32 text-right">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted-foreground">
                  Cargando…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted-foreground">
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
                      hour12: true,
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

                  <td className="whitespace-nowrap">
                    {formatMoney(
                      (m.quantity_value ?? m.quantity) *
                        Number(m.unit_cost ?? m.products?.unit_cost ?? 0),
                    )}
                  </td>

                  <td className="text-muted-foreground">
                    {m.type === "salida" ? (
                      <>
                        <div>
                          {m.unit_type
                            ? (UNIT_TYPE_LABELS[m.unit_type] ?? m.unit_type)
                            : (customers.find((customer) => customer.id === m.customer_id)?.name ??
                              "—")}
                        </div>
                        {(m.unit_type_value || m.measure_unit) && (
                          <div className="text-xs">{m.unit_type_value || m.measure_unit}</div>
                        )}
                      </>
                    ) : (
                      (suppliers.find((supplier) => supplier.id === m.supplier_id)?.name ?? "—")
                    )}
                  </td>

                  <td className="text-muted-foreground">
                    <div>
                      {m.type === "entrada"
                        ? m.purchase_order || m.document_number || "—"
                        : customers.find((customer) => customer.id === m.customer_id)?.name ||
                          m.reference ||
                          "—"}
                    </div>
                    {m.type === "salida" && m.document_number && (
                      <div className="text-xs">Valor / Número: {m.document_number}</div>
                    )}
                  </td>

                  <td className="whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        className="btn btn-ghost p-1.5"
                        onClick={() => printMovement(m)}
                        aria-label="Imprimir"
                        title="Imprimir"
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          className="btn btn-ghost p-1.5"
                          onClick={() => openEdit(m)}
                          aria-label="Editar"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          className="btn btn-ghost p-1.5 text-destructive"
                          onClick={() => handleDelete(m.id)}
                          aria-label="Eliminar"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
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
            Compras y ventas tomadas de los movimientos registrados, con proveedor o maestro,
            documento y orden de compra. Filtra los documentos para encontrar compras anulables.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,2fr)_minmax(11rem,1fr)_minmax(11rem,1fr)_minmax(11rem,1fr)_auto]">
          <div>
            <label className="label" htmlFor="purchase-document-search">
              Buscar documento
            </label>
            <input
              id="purchase-document-search"
              className="input"
              type="search"
              placeholder="Número de documento u OC"
              value={purchaseSearch}
              onChange={(event) => setPurchaseSearch(event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="purchase-operation-filter">
              Tipo de movimiento
            </label>
            <select
              id="purchase-operation-filter"
              className="input"
              value={purchaseOperationFilter}
              onChange={(event) =>
                setPurchaseOperationFilter(event.target.value as PurchaseOperationFilter)
              }
            >
              <option value="">Compras y ventas</option>
              <option value="entrada">Compra</option>
              <option value="salida">Venta</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="purchase-document-type-filter">
              Tipo de documento
            </label>
            <select
              id="purchase-document-type-filter"
              className="input"
              value={purchaseDocumentFilter}
              onChange={(event) =>
                setPurchaseDocumentFilter(event.target.value as PurchaseDocumentFilter)
              }
            >
              <option value="">Todos los documentos</option>
              <option value="factura">Factura</option>
              <option value="guia_despacho">Guía de despacho</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="purchase-document-status-filter">
              Estado
            </label>
            <select
              id="purchase-document-status-filter"
              className="input"
              value={purchaseStatusFilter}
              onChange={(event) =>
                setPurchaseStatusFilter(event.target.value as PurchaseStatusFilter)
              }
            >
              <option value="">Todos los estados</option>
              <option value="vigente">Vigente</option>
              <option value="anulada">Anulada</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="btn btn-secondary w-full"
              disabled={
                !purchaseSearch &&
                !purchaseOperationFilter &&
                !purchaseDocumentFilter &&
                !purchaseStatusFilter
              }
              onClick={() => {
                setPurchaseSearch("");
                setPurchaseOperationFilter("");
                setPurchaseDocumentFilter("");
                setPurchaseStatusFilter("");
              }}
            >
              Limpiar filtros
            </button>
          </div>
        </div>

        <table className="table-base">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Proveedor / Maestro</th>
              <th>Tipo de documento</th>
              <th>Número de documento</th>
              <th>Orden de compra</th>
              <th>Estado</th>
              <th className="w-52">Acción</th>
            </tr>
          </thead>

          <tbody>
            {purchasesLoading ? (
              <tr>
                <td colSpan={8} className="py-6 text-center">
                  Cargando compras y ventas…
                </td>
              </tr>
            ) : registeredDocumentsError ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-destructive">
                  No se pudieron cargar los documentos registrados. Intenta actualizar la página.
                </td>
              </tr>
            ) : registeredDocumentMovements.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-muted-foreground">
                  No hay compras ni ventas registradas con documentos.
                </td>
              </tr>
            ) : filteredPurchases.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-muted-foreground">
                  No hay documentos que coincidan con esos filtros.
                </td>
              </tr>
            ) : (
              filteredPurchases.map((purchase) => (
                <tr key={purchase.id}>
                  <td className="whitespace-nowrap">
                    {new Date(purchase.created_at).toLocaleDateString("es-CL")}
                  </td>

                  <td>{purchase.type === "entrada" ? "Compra" : "Venta"}</td>

                  <td>
                    {purchase.type === "entrada"
                      ? (suppliers.find((supplier) => supplier.id === purchase.supplier_id)?.name ??
                        "—")
                      : (customers.find((customer) => customer.id === purchase.customer_id)?.name ??
                        "—")}
                  </td>

                  <td>
                    {purchase.document_type === "factura"
                      ? "Factura"
                      : purchase.document_type === "guia_despacho"
                        ? "Guía de despacho"
                        : "—"}
                  </td>

                  <td className="font-mono">{purchase.document_number}</td>

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
                    <div className="flex flex-wrap gap-1">
                      {!purchase.cancelled_at &&
                        ((purchase.type === "entrada" && canEditPurchases) ||
                          (purchase.type === "salida" && canEdit)) && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={saving}
                            onClick={() => openEditRegisteredDocument(purchase)}
                            title="Editar documento y sus líneas"
                          >
                            <Pencil className="h-4 w-4" />
                            Editar
                          </button>
                        )}
                      {!purchase.cancelled_at &&
                        ((purchase.type === "entrada" && canDeletePurchases) ||
                          (purchase.type === "salida" && canDelete)) && (
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
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Formulario de movimiento */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto sm:items-center bg-foreground/40 p-4">
          <div className="card my-2 flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col gap-3 overflow-hidden p-4 text-sm sm:my-4 sm:p-5">
            <div className="flex shrink-0 items-center justify-between">
              <h2 className="font-display text-lg font-bold">
                {editingId
                  ? editingPurchaseEntryId
                    ? "Modificar compra"
                    : editingRegisteredMovementIds
                      ? form.type === "entrada"
                        ? "Modificar compra"
                        : "Modificar venta"
                      : "Modificar movimiento"
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
              className="flex min-h-0 flex-1 flex-col gap-3"
            >
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-2">
                  {(["entrada", "salida"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={!!editingId}
                      className={`btn ${form.type === t ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => {
                        setForm({ ...form, type: t });

                        setPurchaseItems([newPurchaseItem()]);
                      }}
                    >
                      {t === "entrada" ? "Entrada" : "Salida"}
                    </button>
                  ))}
                </div>

                {isPurchaseForm ? (
                  <>
                    <div className="grid gap-2 md:grid-cols-2">
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
                          <div key={item.key} className="space-y-2 rounded-lg border p-3">
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
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
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
                        <select
                          className="input"
                          value={form.customer_id}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              customer_id: e.target.value,
                              reference:
                                customers.find((customer) => customer.id === e.target.value)
                                  ?.name ?? "",
                            })
                          }
                        >
                          <option value="">
                            {form.reference
                              ? `Maestro anterior: ${form.reference}`
                              : "Selecciona un maestro…"}
                          </option>
                          {customers.map((customer) => (
                            <option key={customer.id} value={customer.id}>
                              {customer.name}
                            </option>
                          ))}
                        </select>
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
                          <div key={item.key} className="space-y-2 rounded-lg border p-3">
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
                                  {products.find((product) => product.id === item.product_id)
                                    ?.sku ?? "—"}
                                </p>
                              )}
                            </div>

                            {item.product_id && (
                              <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
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
              </div>

              <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t pt-3">
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
                  onClick={() => setPreviewOpen(true)}
                >
                  <Eye className="h-4 w-4" />
                  Vista previa
                </button>

                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {previewOpen && formOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/50 p-3 sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="movement-preview-title"
            className="card flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden"
          >
            <header className="flex items-start justify-between gap-4 border-b p-4 sm:p-6">
              <div>
                <h2 id="movement-preview-title" className="font-display text-xl font-bold">
                  {previewTitle}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Revisa los datos antes de registrar e imprimir.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void save(true)}
                  disabled={saving}
                >
                  <Printer className="h-4 w-4" />
                  {saving ? "Registrando…" : "Imprimir"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost p-1.5"
                  aria-label="Cerrar vista previa"
                  onClick={() => setPreviewOpen(false)}
                  disabled={saving}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
              <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
                {isPurchaseForm ? (
                  <>
                    <p>
                      <strong>Proveedor:</strong> {previewSupplier}
                    </p>
                    <p>
                      <strong>Orden de compra:</strong> {purchaseOrder.trim() || "—"}
                    </p>
                    <p>
                      <strong>
                        {documentType === "factura" ? "Factura" : "Guía de despacho"}:
                      </strong>{" "}
                      {documentNumber.trim() || "—"}
                    </p>
                    <p>
                      <strong>Tipo:</strong> Entrada
                    </p>
                  </>
                ) : form.type === "salida" ? (
                  <>
                    <p>
                      <strong>Tipo de unidad:</strong>{" "}
                      {UNIT_TYPE_LABELS[form.unit_type] ?? form.unit_type}
                    </p>
                    <p>
                      <strong>UNIDADES:</strong> {form.unit_type_value || "—"}
                    </p>
                    <p>
                      <strong>Cliente / Nombre maestro:</strong> {previewCustomer}
                    </p>
                    <p>
                      <strong>Valor / Número:</strong> {form.document_number.trim() || "—"}
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      <strong>Tipo:</strong> Entrada
                    </p>
                    <p>
                      <strong>Proveedor:</strong> {previewSupplier}
                    </p>
                    <p>
                      <strong>Referencia:</strong> {form.reference.trim() || "—"}
                    </p>
                  </>
                )}
                <p className="sm:col-span-2">
                  <strong>Observaciones:</strong> {form.notes.trim() || "—"}
                </p>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <table className="table-base [&_td]:whitespace-nowrap">
                  <thead>
                    <tr>
                      <th>Descripción</th>
                      <th>SKU</th>
                      <th className="text-right">Cantidad</th>
                      <th>Unidad</th>
                      <th className="text-right">
                        {form.type === "salida" ? "Costo unitario" : "Valor unitario"}
                      </th>
                      <th className="text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewItems.map((item) => (
                      <tr key={item.key}>
                        <td>{item.name}</td>
                        <td>{item.sku}</td>
                        <td className="text-right">{item.quantity}</td>
                        <td>{item.unit}</td>
                        <td className="text-right">{formatMoney(item.unitPrice)}</td>
                        <td className="text-right">
                          {formatMoney(item.quantity * item.unitPrice)}
                        </td>
                      </tr>
                    ))}
                    {previewItems.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-muted-foreground">
                          No hay productos agregados.
                        </td>
                      </tr>
                    )}
                    <tr className="bg-muted font-bold">
                      <td colSpan={5} className="text-right">
                        TOTAL
                      </td>
                      <td className="text-right">{formatMoney(previewTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <footer className="flex justify-end border-t p-4 sm:px-6">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setPreviewOpen(false)}
                disabled={saving}
              >
                Volver a editar
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
