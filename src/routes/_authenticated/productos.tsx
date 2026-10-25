import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  FileUp,
  Plus,
  Pencil,
  RotateCcw,
  ScanLine,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { downloadInventoryWorkbook, readInventoryWorkbook } from "@/lib/warehouse-excel";
import { validateInventoryImport, type InventoryImportValidation } from "@/lib/warehouse-excel";
import { CATEGORIES, normalizeCode } from "@/lib/warehouse";
import { hasPermission, useAppAccess } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/productos")({
  head: () => ({
    meta: [
      { title: "Inventario — BodegaPro" },
      {
        name: "description",
        content: "Inventario de productos de la bodega con stock en tiempo real.",
      },
    ],
  }),
  component: ProductosPage,
});

type Product = Tables<"products">;
type ProductForm = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  supplier_id: string;
  min_stock: number;
  location: string;
  unit_cost: number;
  barcode: string;
  stock: number;
};

function getProductStock(product: Product) {
  const stock = Number(product.stock_quantity ?? product.stock ?? 0);
  return Number.isFinite(stock) ? stock : 0;
}

function formatQuantity(value: number) {
  return value.toLocaleString("es-CL");
}

function getSaveErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Error desconocido al guardar el producto";
}

const DEFAULT_CATEGORY = CATEGORIES[0];

const DEFAULT_UNITS = [
  "unidad",
  "kg",
  "rollo",
  "lata",
  "tambor",
  "mt",
  "lts",
  "m²",
  "m³",
  "caja",
  "par",
];

const EMPTY_FORM: ProductForm = {
  sku: "",
  name: "",
  category: DEFAULT_CATEGORY,
  unit: "unidad",
  supplier_id: "",
  min_stock: 0,
  location: "",
  unit_cost: 0,
  barcode: "",
  stock: 0,
};

function ProductosPage() {
  const access = useAppAccess();
  const canCreate = hasPermission(access?.name, access?.permissions, "inventory", "create");
  const canEdit = hasPermission(access?.name, access?.permissions, "inventory", "edit");
  const canDelete = hasPermission(access?.name, access?.permissions, "inventory", "delete");
  const isAdmin = (access?.name ?? "").trim().toUpperCase() === "ADMIN";
  const [categoryFilter, setCategoryFilter] = useState("");
  const [managementFilter, setManagementFilter] = useState<"" | "comprar" | "ok">("");
  const [pageSize, setPageSize] = useState<10 | 20>(10);
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<
    (InventoryImportValidation & { fileName: string }) | null
  >(null);
  const [downloading, setDownloading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const scannerVideoRef = useRef<HTMLVideoElement>(null);
  const [unitOptions, setUnitOptions] = useState<string[]>(DEFAULT_UNITS);
  const [customUnit, setCustomUnit] = useState("");
  const [addingUnit, setAddingUnit] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel("products-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => {
        queryClient.invalidateQueries({ queryKey: ["products"] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const {
    data: products = [],
    isLoading,
    isError: productsError,
  } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const {
    data: suppliers = [],
    isLoading: suppliersLoading,
    isError: suppliersError,
  } = useQuery({
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

  const { data: priceHistory = { fromItems: [], fromMovements: [] } } = useQuery<{
    fromItems: Array<{ product_id: string; unit_price: number }>;
    fromMovements: Array<{ product_id: string; unit_price: number }>;
  }>({
    queryKey: ["inventory-cost-trends"],
    queryFn: async () => {
      const [items, movements] = await Promise.all([
        (supabase as any)
          .from("purchase_entry_items")
          .select("product_id, unit_price, created_at")
          .order("created_at", { ascending: false })
          .limit(5000),
        (supabase as any)
          .from("stock_movements")
          .select("product_id, unit_cost, created_at, reference")
          .eq("type", "entrada")
          .gt("unit_cost", 0)
          .order("created_at", { ascending: false })
          .limit(5000),
      ]);
      if (items.error) throw items.error;
      const fromItems = (items.data ?? []).map((row: any) => ({
        product_id: row.product_id as string,
        unit_price: Number(row.unit_price),
      }));
      const fromMovements = (movements.data ?? [])
        .filter((row: any) => !String(row.reference ?? "").startsWith("Anulación"))
        .map((row: any) => ({
          product_id: row.product_id as string,
          unit_price: Number(row.unit_cost),
        }));
      return { fromItems, fromMovements };
    },
  });

  // Hasta 3 precios más recientes por producto; el primero es el más nuevo.
  const costTrends = new Map<string, "up" | "same" | "down">();
  {
    const collect = (rows: Array<{ product_id: string; unit_price: number }>) => {
      const recent = new Map<string, number[]>();
      for (const row of rows) {
        const prices = recent.get(row.product_id) ?? [];
        if (prices.length < 3) {
          prices.push(row.unit_price);
          recent.set(row.product_id, prices);
        }
      }
      return recent;
    };
    const fromItems = collect(priceHistory.fromItems ?? []);
    const fromMovements = collect(priceHistory.fromMovements ?? []);
    for (const productId of new Set([...fromItems.keys(), ...fromMovements.keys()])) {
      const a = fromItems.get(productId) ?? [];
      const b = fromMovements.get(productId) ?? [];
      const prices = a.length >= b.length ? a : b;
      const [latest, ...previous] = prices;
      if (latest === undefined || previous.length === 0) continue;
      const average = previous.reduce((sum, price) => sum + price, 0) / previous.length;
      costTrends.set(
        productId,
        latest > average + 0.5 ? "up" : latest < average - 0.5 ? "down" : "same",
      );
    }
  }

  const filtered = products.filter((p) => {
    if (p.active === showArchived) return false;
    if (categoryFilter && p.category !== categoryFilter) return false;
    if (managementFilter) {
      const needsPurchase = getProductStock(p) <= (Number(p.min_stock) || 0);
      if ((managementFilter === "comprar") !== needsPurchase) return false;
    }
    const term = search.trim().toLowerCase();
    return [p.name, p.sku, p.category].some((value) => (value ?? "").toLowerCase().includes(term));
  });

  const categoryOptions = Array.from(
    new Set([...CATEGORIES, ...products.map((p) => p.category).filter(Boolean)]),
  ).sort((a, b) => a.localeCompare(b, "es"));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedProducts = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, managementFilter, showArchived, pageSize]);

  function openNew() {
    setEditing(null);
    setScanning(false);
    setForm(EMPTY_FORM);
    setCustomUnit("");
    setAddingUnit(false);
    setFormOpen(true);
  }

  function openEdit(p: Product) {
    setScanning(false);
    setEditing(p);
    const savedUnit = p.unit ?? "unidad";
    if (!unitOptions.some((unit) => unit.toLowerCase() === savedUnit.toLowerCase())) {
      setUnitOptions((current) => [...current, savedUnit]);
    }
    setForm({
      sku: p.sku ?? "",
      name: p.name ?? "",
      category: p.category ?? DEFAULT_CATEGORY,
      unit: savedUnit,
      supplier_id: p.supplier_id ?? "",
      min_stock: Number(p.min_stock ?? 0),
      location: p.location ?? "",
      unit_cost: Number(p.unit_cost) || 0,
      barcode: p.barcode ?? "",
      stock: getProductStock(p),
    });
    setCustomUnit("");
    setAddingUnit(false);
    setFormOpen(true);
  }

  function addCustomUnit() {
    const value = customUnit.trim();
    if (!value) {
      toast.error("Escribe el nombre de la nueva unidad");
      return;
    }
    const existing = unitOptions.find((unit) => unit.toLowerCase() === value.toLowerCase());
    if (existing) {
      setForm((current) => ({ ...current, unit: existing }));
    } else {
      setUnitOptions((current) => [...current, value]);
      setForm((current) => ({ ...current, unit: value }));
    }
    setCustomUnit("");
    setAddingUnit(false);
    toast.success("Unidad agregada al selector");
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const sku = form.sku.trim();
    const name = form.name.trim();
    const category = form.category.trim();
    const barcode = form.barcode.trim();
    if (!name || !category || !form.unit.trim()) {
      toast.error("Completa la categoría, descripción y unidad de medida");
      return;
    }
    if (!Number.isFinite(form.min_stock) || form.min_stock < 0) {
      toast.error("El stock crítico debe ser un número igual o mayor a cero");
      return;
    }
    if (isAdmin && editing && (!Number.isFinite(form.stock) || form.stock < 0)) {
      toast.error("El stock debe ser un número igual o mayor a cero");
      return;
    }
    if (!Number.isFinite(form.unit_cost) || form.unit_cost < 0) {
      toast.error("El costo unitario debe ser un número igual o mayor a cero");
      return;
    }

    const duplicateSku = sku
      ? products.find(
          (product) =>
            product.id !== editing?.id &&
            product.sku.trim().toLocaleLowerCase() === sku.toLocaleLowerCase(),
        )
      : undefined;
    if (duplicateSku) {
      toast.error(`El SKU "${sku}" ya pertenece a ${duplicateSku.name}`);
      return;
    }

    const duplicateBarcode = barcode
      ? products.find(
          (product) =>
            product.id !== editing?.id &&
            product.barcode?.trim().toLocaleLowerCase() === barcode.toLocaleLowerCase(),
        )
      : undefined;
    if (duplicateBarcode) {
      toast.error(
        `El código ya pertenece al producto ${duplicateBarcode.sku} — ${duplicateBarcode.name}`,
      );
      return;
    }

    setScanning(false);
    setReviewOpen(true);
  }

  async function confirmSave() {
    setSaving(true);
    try {
      const payload = {
        sku: editing ? form.sku.trim() : "",
        name: form.name.trim(),
        category: form.category.trim(),
        unit: form.unit.trim() || "unidad",
        supplier_id: form.supplier_id || null,
        min_stock: Number(form.min_stock),
        location: form.location.trim() || null,
        unit_cost: Number(form.unit_cost),
        barcode: form.barcode.trim() || null,
        ...(isAdmin && editing && form.stock !== getProductStock(editing)
          ? { stock_quantity: Number(form.stock) }
          : {}),
      };

      if (editing) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success(`Producto "${payload.name}" modificado correctamente`);
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
        toast.success(`Producto "${payload.name}" ingresado correctamente`);
      }

      setFormOpen(false);
      setReviewOpen(false);
      setScanning(false);
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      toast.error(
        `No se pudo ${editing ? "modificar" : "guardar"} el producto: ${getSaveErrorMessage(err)}`,
        { duration: 8000 },
      );
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!formOpen || !scanning || !scannerVideoRef.current) return;

    let active = true;
    let controls: { stop: () => void } | undefined;
    void (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (!active || !scannerVideoRef.current) return;

        const reader = new BrowserMultiFormatReader();
        const scanControls = await reader.decodeFromVideoDevice(
          undefined,
          scannerVideoRef.current,
          (result, _error, scannerControls) => {
            if (!active || !result) return;

            const scannedValue = result.getText().trim();
            const normalizedCode = normalizeCode(scannedValue);
            const matchedProduct = products.find(
              (product) =>
                product.barcode?.trim() === scannedValue ||
                product.barcode?.trim() === normalizedCode ||
                product.sku.toLocaleLowerCase() === normalizedCode.toLocaleLowerCase(),
            );

            if (matchedProduct) {
              setEditing(matchedProduct);
              const savedUnit = matchedProduct.unit || "unidad";
              setUnitOptions((current) =>
                current.some((unit) => unit.toLowerCase() === savedUnit.toLowerCase())
                  ? current
                  : [...current, savedUnit],
              );
              setForm({
                sku: matchedProduct.sku,
                name: matchedProduct.name,
                category: matchedProduct.category,
                unit: savedUnit,
                supplier_id: matchedProduct.supplier_id ?? "",
                min_stock: Number(matchedProduct.min_stock) || 0,
                location: matchedProduct.location ?? "",
                unit_cost: Number(matchedProduct.unit_cost) || 0,
                barcode: matchedProduct.barcode ?? scannedValue,
                stock: getProductStock(matchedProduct),
              });
              toast.success("El producto ya existe; se cargaron sus datos para editarlo");
            } else {
              setForm((current) => ({ ...current, barcode: scannedValue }));
              toast.success("Código leído; completa los datos del producto");
            }

            scannerControls.stop();
            setScanning(false);
          },
        );
        controls = scanControls;
        if (!active) controls.stop();
      } catch (error) {
        if (!active) return;
        setScanning(false);
        toast.error(
          error instanceof Error
            ? `No se pudo iniciar la cámara: ${error.message}`
            : "No se pudo iniciar la cámara",
        );
      }
    })();

    return () => {
      active = false;
      controls?.stop();
    };
  }, [formOpen, scanning, products]);

  async function handleDelete(p: Product) {
    if (getProductStock(p) > 0) {
      toast.error(
        "No se puede quitar un producto con stock disponible. Registra su salida primero.",
      );
      return;
    }
    if (!confirm(`¿Quitar "${p.name}" del inventario activo? Su historial se conservará.`)) {
      return;
    }
    setDeletingId(p.id);
    try {
      const { error } = await supabase.rpc("archive_product", { p_product_id: p.id });
      if (error) throw error;
      toast.success("Producto quitado del inventario; su historial se conservó");
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      const message =
        typeof err === "object" && err !== null && "message" in err
          ? String(err.message)
          : err instanceof Error
            ? err.message
            : "No se pudo quitar el producto del inventario";
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRestore(p: Product) {
    setDeletingId(p.id);
    try {
      const { error } = await supabase.from("products").update({ active: true }).eq("id", p.id);
      if (error) throw error;
      toast.success("Producto restaurado al inventario");
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      const message =
        typeof err === "object" && err !== null && "message" in err
          ? String(err.message)
          : err instanceof Error
            ? err.message
            : "No se pudo restaurar el producto";
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDownloadTemplate() {
    setDownloading(true);
    try {
      await downloadInventoryWorkbook(
        products
          .filter((product) => product.active)
          .map((product) => ({
            sku: product.sku,
            name: product.name,
            category: product.category,
            stock_quantity: getProductStock(product),
            min_stock: Number(product.min_stock) || 0,
            unit_cost: Number(product.unit_cost) || 0,
          })),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo crear la planilla de inventario",
      );
    } finally {
      setDownloading(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const rows = await readInventoryWorkbook(file);
      const { data: existingProducts, error } = await supabase
        .from("products")
        .select("id, sku, name, category");
      if (error) throw error;

      const validation = validateInventoryImport(rows, existingProducts ?? []);
      setImportPreview({ ...validation, fileName: file.name });
      if (validation.errors.length > 0) {
        toast.error(`Se encontraron ${validation.errors.length} problemas en la planilla`);
      } else {
        toast.success("Validación completada. Revisa el resumen antes de importar.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo importar la planilla");
    } finally {
      e.target.value = "";
      setImporting(false);
    }
  }

  async function confirmImport() {
    if (!importPreview || importPreview.errors.length > 0) return;

    setImporting(true);
    try {
      const { data: existingProducts, error: fetchError } = await supabase
        .from("products")
        .select("id, sku, name, category");
      if (fetchError) throw fetchError;

      const validation = validateInventoryImport(importPreview.rows, existingProducts ?? []);
      if (validation.errors.length > 0) {
        setImportPreview({ ...validation, fileName: importPreview.fileName });
        toast.error("El inventario cambió desde la revisión. Corrige los productos duplicados.");
        return;
      }

      const payload = validation.rows.map(({ rowNumber: _rowNumber, ...row }) => ({
        ...row,
        sku: row.sku ?? "",
      }));
      const { error } = await supabase.from("products").upsert(payload, { onConflict: "sku" });
      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(
        `Inventario cargado: ${validation.newCount} nuevos y ${validation.updateCount} actualizados. Los SKU nuevos se asignaron automáticamente.`,
      );
      setImportPreview(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo importar la planilla");
    } finally {
      setImporting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-4 px-2 py-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventario</h1>
          <p className="text-sm text-muted-foreground">
            {products.filter((product) => product.active).length} productos en inventario
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void handleDownloadTemplate()}
            disabled={
              downloading || importing || Boolean(importPreview) || isLoading || productsError
            }
          >
            <Download className="h-4 w-4" />
            {downloading ? "Preparando…" : "Planilla Excel"}
          </button>
          {canCreate && canEdit && (
            <>
              <input
                ref={uploadInputRef}
                type="file"
                accept=".xlsx"
                className="sr-only"
                onChange={(e) => void handleImport(e)}
                aria-label="Seleccionar planilla Excel de inventario"
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => uploadInputRef.current?.click()}
                disabled={importing || downloading || Boolean(importPreview)}
              >
                <FileUp className="h-4 w-4" />
                {importing ? "Importando…" : "Subir Excel"}
              </button>
            </>
          )}
          {canCreate && (
            <button className="btn btn-primary" onClick={openNew}>
              <Plus className="h-4 w-4" /> Nuevo producto
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input w-full max-w-sm"
          placeholder="Buscar por descripción, SKU o categoría…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar productos"
        />
        <select
          className="input w-auto"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filtrar por categoría"
        >
          <option value="">Todas las categorías</option>
          {categoryOptions.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <select
          className="input w-auto"
          value={managementFilter}
          onChange={(e) => setManagementFilter(e.target.value as "" | "comprar" | "ok")}
          aria-label="Filtrar por gestión"
        >
          <option value="">Toda la gestión</option>
          <option value="comprar">Comprar</option>
          <option value="ok">OK</option>
        </select>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setShowArchived((current) => !current)}
        >
          {showArchived
            ? "Volver al inventario"
            : `Ver archivados (${products.filter((product) => !product.active).length})`}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        La planilla agrega o actualiza productos por SKU y reemplaza el stock indicado; no genera
        movimientos. Deja el SKU vacío para generar uno automáticamente en productos nuevos. El
        costo total y la gestión se calculan automáticamente.
      </p>

      <div className="card overflow-x-auto">
        <table className="table-base w-full text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap [&_td:nth-child(2)]:whitespace-normal">
          <thead>
            <tr>
              <th className="w-[10%]">SKU</th>
              <th className="w-[26%]">Descripción</th>
              <th className="w-[14%]">Categoría</th>
              <th className="w-[10%]">Stock</th>
              <th className="hidden w-[9%] lg:table-cell">Stock crítico</th>
              <th className="w-[10%]">Costo unitario</th>
              <th className="hidden w-[10%] lg:table-cell">Costo total</th>
              <th className="w-[9%]">Gestión</th>
              <th className="w-[84px]"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted-foreground">
                  Cargando productos…
                </td>
              </tr>
            ) : productsError ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-destructive">
                  No se pudieron cargar los productos. Revisa la conexión con Supabase.
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted-foreground">
                  No hay productos que coincidan con la búsqueda.
                </td>
              </tr>
            ) : (
              pagedProducts.map((p) => {
                const stock = getProductStock(p);
                const minStock = Number(p.min_stock) || 0;
                const unitCost = Number(p.unit_cost) || 0;
                const stockStatus =
                  stock < minStock
                    ? "badge-destructive"
                    : stock === minStock
                      ? "badge-warning"
                      : "badge-success";
                return (
                  <tr key={p.id}>
                    <td className="break-all text-xs text-muted-foreground">{p.sku}</td>
                    <td className="font-medium">{p.name}</td>
                    <td>
                      <span className="badge badge-muted whitespace-normal text-[11px] leading-tight">
                        {p.category}
                      </span>
                    </td>
                    <td>
                      <span className={`badge whitespace-nowrap ${stockStatus}`}>
                        {formatQuantity(stock)} {p.unit}
                      </span>
                    </td>
                    <td className="hidden lg:table-cell">
                      {formatQuantity(minStock)} {p.unit}
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-1">
                        {unitCost.toLocaleString("es-CL", {
                          style: "currency",
                          currency: "CLP",
                          maximumFractionDigits: 0,
                        })}
                        {(() => {
                          const trend = costTrends.get(p.id);
                          if (!trend) return null;
                          const label =
                            trend === "up"
                              ? "El costo subió respecto de las compras anteriores"
                              : trend === "down"
                                ? "El costo bajó respecto de las compras anteriores"
                                : "El costo se mantiene";
                          const Icon =
                            trend === "up" ? ArrowUp : trend === "down" ? ArrowDown : ArrowRight;
                          return (
                            <Icon
                              className={`h-3.5 w-3.5 ${trend === "up" ? "text-destructive" : "text-success"}`}
                              aria-label={label}
                            >
                              <title>{label}</title>
                            </Icon>
                          );
                        })()}
                      </span>
                    </td>
                    <td className="hidden lg:table-cell">
                      {(stock * unitCost).toLocaleString("es-CL", {
                        style: "currency",
                        currency: "CLP",
                        maximumFractionDigits: 0,
                      })}
                    </td>
                    <td>
                      <span
                        className={`badge ${stock <= minStock ? "badge-warning" : "badge-success"}`}
                      >
                        {stock <= minStock ? "Comprar" : "OK"}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        {canEdit && (
                          <button
                            className="btn btn-ghost p-1.5"
                            onClick={() => openEdit(p)}
                            aria-label={`Editar ${p.name}`}
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {canDelete && p.active && (
                          <button
                            className="btn btn-ghost p-1.5 text-destructive"
                            onClick={() => void handleDelete(p)}
                            disabled={deletingId === p.id}
                            aria-label={`Quitar ${p.name} del inventario`}
                            title="Quitar del inventario"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        {canEdit && !p.active && (
                          <button
                            className="btn btn-ghost p-1.5"
                            onClick={() => void handleRestore(p)}
                            disabled={deletingId === p.id}
                            aria-label={`Restaurar ${p.name}`}
                            title="Restaurar al inventario"
                          >
                            <RotateCcw className="h-4 w-4" />
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

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">Filas por página</span>
          <select
            className="input w-20"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value) === 20 ? 20 : 10)}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
          </select>
        </label>
        <span className="text-muted-foreground">
          {filtered.length.toLocaleString("es-CL")}{" "}
          {filtered.length === 1 ? "producto" : "productos"}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-secondary p-1.5"
            onClick={() => setPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            aria-label="Página anterior"
            title="Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-muted-foreground">
            Página {currentPage} de {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-secondary p-1.5"
            onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            aria-label="Página siguiente"
            title="Siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {formOpen && (editing ? canEdit : canCreate) && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto sm:items-center bg-foreground/40 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) {
              setScanning(false);
              setFormOpen(false);
            }
          }}
        >
          <section
            className="card my-auto w-full max-w-lg p-5 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-form-title"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="product-form-title" className="font-display text-lg font-bold">
                {editing ? "Editar producto" : "Nuevo producto"}
              </h2>
              <button
                type="button"
                className="btn btn-ghost p-1.5"
                onClick={() => {
                  setScanning(false);
                  setFormOpen(false);
                }}
                disabled={saving}
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="product-sku">
                    SKU
                  </label>
                  <input
                    id="product-sku"
                    className="input w-full"
                    value={editing ? form.sku : "Se asigna automáticamente al guardar"}
                    readOnly
                    aria-describedby="product-sku-help"
                  />
                  {!editing && (
                    <p id="product-sku-help" className="mt-1 text-xs text-muted-foreground">
                      El código se generará según la categoría.
                    </p>
                  )}
                </div>
                <div>
                  <label className="label" htmlFor="product-category">
                    Categoría *
                  </label>
                  <select
                    id="product-category"
                    className="input w-full"
                    value={
                      CATEGORIES.includes(form.category as (typeof CATEGORIES)[number])
                        ? form.category
                        : "__custom__"
                    }
                    onChange={(e) =>
                      setForm({
                        ...form,
                        category: e.target.value === "__custom__" ? "" : e.target.value,
                      })
                    }
                    required
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                    <option value="__custom__">＋ Otra categoría…</option>
                  </select>
                  {!CATEGORIES.includes(form.category as (typeof CATEGORIES)[number]) && (
                    <input
                      className="input mt-2 w-full"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      placeholder="Escribe la nueva categoría"
                      aria-label="Nueva categoría"
                      required
                      maxLength={80}
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="label" htmlFor="product-name">
                  Descripción *
                </label>
                <input
                  id="product-name"
                  className="input w-full"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  maxLength={200}
                  placeholder="Ej.: Pintura esmalte al agua blanca"
                />
              </div>

              <div>
                <label className="label" htmlFor="product-barcode">
                  Código de barras o QR (opcional)
                </label>
                <div className="flex gap-2">
                  <input
                    id="product-barcode"
                    className="input min-w-0 flex-1"
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                    maxLength={500}
                    placeholder="Escanea o escribe el código"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary shrink-0"
                    onClick={() => setScanning(true)}
                    disabled={scanning}
                    aria-label="Escanear código de barras o QR"
                  >
                    <ScanLine className="h-4 w-4" />
                    Escanear
                  </button>
                </div>
                {scanning && (
                  <div className="mt-3 space-y-2">
                    <video
                      ref={scannerVideoRef}
                      className="aspect-video w-full rounded-md bg-foreground object-cover"
                      autoPlay
                      muted
                      playsInline
                      aria-label="Vista de cámara para escanear el código"
                    />
                    <p className="text-xs text-muted-foreground">
                      Apunta la cámara al código de barras o QR. El navegador solicitará permiso
                      para usar la cámara.
                    </p>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setScanning(false)}
                    >
                      Cancelar escaneo
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="label" htmlFor="product-supplier">
                  Proveedor
                </label>
                <select
                  id="product-supplier"
                  className="input w-full"
                  value={form.supplier_id}
                  onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                  disabled={suppliersLoading || suppliersError}
                >
                  <option value="">Sin proveedor</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
                {suppliersError && (
                  <p className="mt-1 text-xs text-destructive">
                    No se pudieron cargar proveedores. Revisa la tabla suppliers.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="product-unit">
                    Unidad de medida *
                  </label>
                  <select
                    id="product-unit"
                    className="input w-full"
                    value={addingUnit ? "__add_new__" : form.unit}
                    onChange={(e) => {
                      if (e.target.value === "__add_new__") {
                        setAddingUnit(true);
                        setCustomUnit("");
                      } else {
                        setAddingUnit(false);
                        setForm({ ...form, unit: e.target.value });
                      }
                    }}
                    required
                  >
                    {unitOptions.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                    <option value="__add_new__">＋ Agregar otra unidad…</option>
                  </select>
                  {addingUnit && (
                    <div className="mt-2 flex gap-2">
                      <input
                        className="input min-w-0 flex-1"
                        value={customUnit}
                        onChange={(e) => setCustomUnit(e.target.value)}
                        placeholder="Nueva unidad"
                        aria-label="Nombre de nueva unidad"
                        autoFocus
                      />
                      <button type="button" className="btn btn-secondary" onClick={addCustomUnit}>
                        Agregar
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {isAdmin && editing && (
                <div className="rounded-md border border-warning/50 bg-warning/10 p-3">
                  <label className="label" htmlFor="product-stock">
                    Stock actual (ajuste de inventario)
                  </label>
                  <input
                    id="product-stock"
                    type="number"
                    min={0}
                    step="any"
                    className="input w-full"
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Solo administradores. Úsalo para cuadrar el inventario general; no genera un
                    movimiento.
                  </p>
                </div>
              )}

              <div>
                <label className="label" htmlFor="product-min-stock">
                  Stock mínimo
                </label>
                <input
                  id="product-min-stock"
                  type="number"
                  min={0}
                  step="1"
                  className="input w-full"
                  value={form.min_stock}
                  onChange={(e) => setForm({ ...form, min_stock: Number(e.target.value) })}
                />
              </div>

              <div>
                <label className="label" htmlFor="product-unit-cost">
                  Costo unitario (CLP)
                </label>
                <input
                  id="product-unit-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  className="input w-full"
                  value={form.unit_cost}
                  onChange={(e) => setForm({ ...form, unit_cost: Number(e.target.value) })}
                  required
                />
              </div>

              <div>
                <label className="label" htmlFor="product-location">
                  Ubicación (opcional)
                </label>
                <input
                  id="product-location"
                  className="input w-full"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Ej.: Estante A-3"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setScanning(false);
                    setFormOpen(false);
                  }}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {reviewOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-foreground/50 p-4">
          <section
            className="card w-full max-w-lg p-5 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-review-title"
          >
            <h2 id="product-review-title" className="font-display text-lg font-bold">
              Revisa los datos del producto
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Confirma que la información esté correcta antes de guardarla.
            </p>

            <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">SKU</dt>
                <dd className="font-medium">
                  {editing ? form.sku : "Se asignará automáticamente"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Categoría</dt>
                <dd className="font-medium">{form.category}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Descripción</dt>
                <dd className="font-medium">{form.name.trim()}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Unidad</dt>
                <dd className="font-medium">{form.unit}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Proveedor</dt>
                <dd className="font-medium">
                  {suppliers.find((supplier) => supplier.id === form.supplier_id)?.name ??
                    "Sin proveedor"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Stock crítico</dt>
                <dd className="font-medium">
                  {formatQuantity(form.min_stock)} {form.unit}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Costo unitario</dt>
                <dd className="font-medium">
                  {form.unit_cost.toLocaleString("es-CL", {
                    style: "currency",
                    currency: "CLP",
                    maximumFractionDigits: 0,
                  })}
                </dd>
              </div>
              {isAdmin && editing && (
                <div>
                  <dt className="text-muted-foreground">Stock actual</dt>
                  <dd className="font-medium">
                    {form.stock !== getProductStock(editing)
                      ? `${formatQuantity(getProductStock(editing))} → ${formatQuantity(form.stock)}`
                      : formatQuantity(form.stock)}{" "}
                    {form.unit}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Código de barras o QR</dt>
                <dd className="break-all font-medium">{form.barcode.trim() || "Sin código"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ubicación</dt>
                <dd className="font-medium">{form.location.trim() || "Sin ubicación"}</dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setReviewOpen(false)}
                disabled={saving}
              >
                Volver a revisar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void confirmSave()}
                disabled={saving}
              >
                {saving ? "Guardando…" : editing ? "Confirmar modificación" : "Confirmar ingreso"}
              </button>
            </div>
          </section>
        </div>
      )}

      {importPreview && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-foreground/50 p-4">
          <section
            className="card w-full max-w-2xl p-5 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-import-review-title"
          >
            <h2 id="inventory-import-review-title" className="font-display text-lg font-bold">
              Validación de planilla
            </h2>
            <p className="mt-1 break-all text-sm text-muted-foreground">
              Archivo: {importPreview.fileName}
            </p>

            {importPreview.errors.length > 0 ? (
              <div
                className="mt-4 max-h-64 overflow-y-auto rounded-md border border-destructive/30 bg-destructive/5 p-3"
                role="alert"
              >
                <p className="font-medium text-destructive">
                  No se importará nada hasta corregir estos datos:
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                  {importPreview.errors.map((error, index) => (
                    <li key={`${index}-${error}`}>{error}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-md bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Filas válidas</p>
                    <p className="font-display text-xl font-bold">{importPreview.rows.length}</p>
                  </div>
                  <div className="rounded-md bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Productos nuevos</p>
                    <p className="font-display text-xl font-bold">{importPreview.newCount}</p>
                  </div>
                  <div className="rounded-md bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Productos a actualizar</p>
                    <p className="font-display text-xl font-bold">{importPreview.updateCount}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  Los productos con SKU existente se actualizarán. Los productos sin SKU recibirán
                  uno automático según su categoría. Stock y costo se reemplazarán por los valores
                  de la planilla.
                </p>
                <div className="mt-3 max-h-40 overflow-y-auto rounded-md border border-border">
                  <table className="table-base w-full">
                    <thead>
                      <tr>
                        <th>Fila</th>
                        <th>SKU</th>
                        <th>Descripción</th>
                        <th>Categoría</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.rows.slice(0, 10).map((row) => (
                        <tr key={row.rowNumber}>
                          <td>{row.rowNumber}</td>
                          <td>{row.sku || "Automático"}</td>
                          <td>{row.name}</td>
                          <td>{row.category}</td>
                        </tr>
                      ))}
                      {importPreview.rows.length > 10 && (
                        <tr>
                          <td colSpan={4} className="text-center text-muted-foreground">
                            y {importPreview.rows.length - 10} productos más…
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setImportPreview(null)}
                disabled={importing}
              >
                {importPreview.errors.length > 0 ? "Cerrar" : "Cancelar"}
              </button>
              {importPreview.errors.length === 0 && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void confirmImport()}
                  disabled={importing}
                >
                  {importing ? "Importando…" : "Confirmar importación"}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
