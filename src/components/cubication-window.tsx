import { NumericInput } from "@/components/numeric-input";
import { useSpecialProducts } from "@/hooks/use-special-products";
import { SpecialProductSelector } from "@/components/special-product-selector";
import { canAccessSpecialProducts, type SpecialProduct } from "@/lib/special-products";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, Pencil, Plus, Printer, Save, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  calculateCubicationTotal,
  CUBICATION_CATEGORIES,
  CUBICATION_COST_FIELDS,
  EMPTY_CUBICATION_COSTS,
  groupByCategory,
  normalizeCubicationCategory,
  type CubicationLine,
  type CubicationCostBreakdown,
  type CubicationProduct,
} from "@/lib/cubication";
import { hasPermission, useAppAccess } from "@/lib/permissions";
import { money } from "@/lib/warehouse";
import { UNIT_TYPE_LABELS } from "@/lib/comprobante-pdf";
import { downloadCubicationPdf, printCubicationPdf } from "@/lib/cubication-pdf";

type SpecialItem = {
  id: string;
  productId: string;
  sku: string;
  unit: string;
  description: string;
  category: string;
  unitCost: string;
  quantity: string;
};

function toNumber(value: string) {
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function newSpecialItem(category: string): SpecialItem {
  return {
    id: crypto.randomUUID(),
    productId: "",
    sku: "",
    unit: "",
    description: "",
    category,
    unitCost: "",
    quantity: "",
  };
}

export function CubicationWindow({ unitCode, onClose }: { unitCode: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const access = useAppAccess();
  const canSpecial =
    canAccessSpecialProducts(access?.name) &&
    hasPermission(access?.name, access?.permissions, "special_inventory");
  const documentId = useRef(crypto.randomUUID());
  const [exporting, setExporting] = useState(false);
  const hydratedSpecial = useRef<string | null>(null);
  const canEdit = hasPermission(access?.name, access?.permissions, "cubication", "edit");

  const [picking, setPicking] = useState(false);
  const [selection, setSelection] = useState<Map<string, string>>(new Map());
  const [costBreakdown, setCostBreakdown] =
    useState<CubicationCostBreakdown>(EMPTY_CUBICATION_COSTS);
  const [client, setClient] = useState("");
  const [unitType, setUnitType] = useState("");
  const [salesOrderNumber, setSalesOrderNumber] = useState("");
  const [specialEnabled, setSpecialEnabled] = useState(false);
  const [specialItems, setSpecialItems] = useState<SpecialItem[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [dirty, setDirty] = useState(false);
  const previousUnitCode = useRef(unitCode);

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["cubication-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, category, unit, stock, stock_quantity, unit_cost")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data.map<CubicationProduct>((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        unit: p.unit,
        stock: Number(p.stock_quantity ?? p.stock) || 0,
        unit_cost: Number(p.unit_cost) || 0,
      }));
    },
  });

  const { data: template, isLoading: templateLoading } = useQuery({
    queryKey: ["cubication-template", unitCode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cubication_templates")
        .select("*, cubication_template_items(product_id, quantity)")
        .eq("unit_code", unitCode)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const {
    data: savedSpecialItems,
    isLoading: specialLoading,
    isError: specialLoadError,
  } = useQuery({
    queryKey: ["cubication-special-items", template?.id],
    enabled: canSpecial && !!template?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cubication_special_items")
        .select("*")
        .eq("template_id", template!.id);
      if (error) throw error;
      return data;
    },
  });
  const {
    data: specialCatalog = [],
    isLoading: specialCatalogLoading,
    isError: specialCatalogError,
  } = useSpecialProducts();

  useEffect(() => {
    if (!template?.id || !savedSpecialItems || hydratedSpecial.current === template.id) return;
    if (
      savedSpecialItems.some(
        (item) => !specialCatalog.some((p) => p.id === item.special_product_id),
      )
    )
      return;
    hydratedSpecial.current = template.id;
    setSpecialItems(
      savedSpecialItems.map((item) => {
        const product = specialCatalog.find((p) => p.id === item.special_product_id)!;
        return {
          id: item.line_id,
          productId: product.id,
          sku: product.sku,
          unit: product.unit,
          description: product.name,
          category: product.category,
          quantity: String(item.quantity),
          unitCost: String(item.unit_cost),
        };
      }),
    );
    setSpecialEnabled(savedSpecialItems.length > 0);
  }, [template?.id, savedSpecialItems, specialCatalog]);

  useEffect(() => {
    setDirty(false);
    setPicking(false);
    const unitChanged = previousUnitCode.current !== unitCode;
    if (unitChanged) {
      previousUnitCode.current = unitCode;
      documentId.current = crypto.randomUUID();
      hydratedSpecial.current = null;
      setCostBreakdown({ ...EMPTY_CUBICATION_COSTS });
      setClient("");
      setUnitType("");
      setSalesOrderNumber("");
      setSpecialEnabled(false);
      setSpecialItems([]);
    }
    if (!template) {
      setSelection(new Map());
      return;
    }
    setSelection(
      new Map(
        template.cubication_template_items.map((item) => [item.product_id, String(item.quantity)]),
      ),
    );
  }, [template, unitCode]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const categories = CUBICATION_CATEGORIES;

  const lines: CubicationLine[] = useMemo(
    () =>
      [...selection.entries()].flatMap(([productId, quantity]) => {
        const product = productById.get(productId);
        return product ? [{ product, quantity: toNumber(quantity) }] : [];
      }),
    [selection, productById],
  );
  const specialLines: CubicationLine[] = useMemo(
    () =>
      specialItems.map((item) => ({
        isSpecial: true,
        specialId: item.id,
        quantity: toNumber(item.quantity),
        product: {
          id: item.id,
          name: item.description,
          sku: item.sku,
          category: item.category,
          unit: item.unit,
          stock: 0,
          unit_cost: toNumber(item.unitCost),
        },
      })),
    [specialItems],
  );
  const groups = useMemo(() => groupByCategory([...lines, ...specialLines]), [lines, specialLines]);
  const materialsTotal = groups.reduce((sum, group) => sum + group.subtotal, 0);
  const totalCost = calculateCubicationTotal(materialsTotal, costBreakdown);

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!category || normalizeCubicationCategory(p.category) === category) &&
        (!term || `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(term)),
    );
  }, [products, search, category]);

  function specialPayload() {
    if (specialLoadError || specialCatalogError)
      throw new Error("No se pudieron cargar los especiales guardados. Recarga antes de guardar.");
    if (
      specialItems.some(
        (item) =>
          !item.productId ||
          !Number.isInteger(Number(item.quantity)) ||
          Number(item.quantity) <= 0 ||
          !Number.isFinite(Number(item.unitCost)) ||
          Number(item.unitCost) < 0,
      )
    ) {
      throw new Error(
        "Selecciona los productos especiales e ingresa cantidades enteras mayores a cero y costos válidos",
      );
    }
    return specialItems.map((item) => ({
      line_id: item.id,
      special_product_id: item.productId,
      quantity: Number(item.quantity),
      unit_cost: Number(item.unitCost),
    }));
  }
  async function persistDocument(saveTemplate: boolean) {
    const items = lines
      .filter((line) => line.quantity > 0)
      .map((line) => ({ product_id: line.product.id, quantity: line.quantity }));
    if (saveTemplate && !items.length && !specialItems.length)
      throw new Error("Selecciona al menos un ítem");
    if (canSpecial) {
      const { error } = await supabase.rpc("save_special_cubication", {
        p_document_id: documentId.current,
        p_unit_code: unitCode,
        p_context: { client, unitType, salesOrderNumber, costBreakdown },
        p_lines: specialPayload(),
        p_save_template: saveTemplate,
        p_items: items,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["special-product-history"] });
    } else if (saveTemplate) {
      const { error } = await supabase.rpc("save_cubication_template", {
        p_unit_code: unitCode,
        p_items: items,
      });
      if (error) throw error;
    }
  }
  const save = useMutation({
    mutationFn: () => persistDocument(true),
    onSuccess: async () => {
      toast.success("Cubicación guardada");
      setDirty(false);
      await queryClient.invalidateQueries({
        queryKey: ["cubication-template", unitCode],
      });
    },
    onError: (error) => {
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : "";
      toast.error(
        /schema cache|could not find the function|does not exist/i.test(message)
          ? `Falta aplicar la migración 0030 (guardado de planillas de cubicación) en Supabase. Detalle: ${message}`
          : message || "No se pudo guardar la cubicación",
      );
    },
  });

  const printData = {
    client,
    unitTypeLabel: UNIT_TYPE_LABELS[unitType] ?? "",
    salesOrderNumber,
    unitCode,
    groups,
    costBreakdown,
  };

  const toggle = (productId: string, checked: boolean) => {
    setDirty(true);
    setSelection((current) => {
      const next = new Map(current);
      if (checked) next.set(productId, next.get(productId) || "1");
      else next.delete(productId);
      return next;
    });
  };

  const setQuantity = (productId: string, quantity: string) => {
    setDirty(true);
    setSelection((current) => new Map(current).set(productId, quantity));
  };

  const setCost = (key: keyof CubicationCostBreakdown, value: string) => {
    setCostBreakdown((current) => ({ ...current, [key]: value }));
  };

  const loading = productsLoading || templateLoading || specialLoading || specialCatalogLoading;
  const hasLines = lines.length > 0 || specialLines.length > 0;

  function toggleSpecial(checked: boolean) {
    setDirty(true);
    setSpecialEnabled(checked);
    if (checked && specialItems.length === 0) {
      setSpecialItems([newSpecialItem(CUBICATION_CATEGORIES[0])]);
    }
  }

  function updateSpecialItem(id: string, key: keyof Omit<SpecialItem, "id">, value: string) {
    setDirty(true);
    setSpecialItems((current) =>
      current.map((item) => (item.id === id ? { ...item, [key]: value } : item)),
    );
  }

  function selectSpecial(id: string, product: SpecialProduct) {
    setDirty(true);
    setSpecialItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              productId: product.id,
              sku: product.sku,
              unit: product.unit,
              description: product.name,
              category: product.category,
              unitCost: String(product.unit_cost),
            }
          : item,
      ),
    );
  }
  async function outputDocument(print: boolean) {
    if (!unitType) {
      toast.error("Selecciona el tipo de unidad antes de generar el documento");
      return;
    }
    let printWindow: Window | null = null;
    if (print) {
      printWindow = window.open("", "_blank");
      if (!printWindow) {
        toast.error("Permite las ventanas emergentes para imprimir");
        return;
      }
    }
    setExporting(true);
    try {
      // Validar antes de imprimir; el UUID estable impide duplicar el uso al repetir PDF/guardar.
      if (canSpecial) await persistDocument(false);
      if (print) printCubicationPdf(printData, printWindow);
      else downloadCubicationPdf(printData);
    } catch (error) {
      printWindow?.close();
      toast.error(
        typeof error === "object" && error && "message" in error
          ? String(error.message)
          : "No se pudo generar el documento",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-2 sm:p-4"
      onClick={exporting || save.isPending ? undefined : onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cubication-title"
        className="card flex max-h-[94vh] w-full max-w-6xl flex-col p-4 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="cubication-title" className="font-display text-lg font-bold">
              Cubicación · {unitCode}
            </h2>
            <p className="text-sm text-muted-foreground">
              {template
                ? "Plantilla guardada para este tipo de unidad."
                : "Aún no hay una plantilla para este tipo de unidad."}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost p-1.5"
            aria-label="Cerrar"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {!loading && !picking && (
            <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
              <label className="space-y-1">
                <span className="label">Cliente</span>
                <input
                  className="input"
                  value={client}
                  onChange={(event) => setClient(event.target.value)}
                  placeholder="Nombre del cliente"
                />
              </label>
              <label className="space-y-1">
                <span className="label">Tipo de unidad</span>
                <select
                  className="input"
                  value={unitType}
                  onChange={(event) => setUnitType(event.target.value)}
                >
                  <option value="">Selecciona el tipo…</option>
                  {Object.entries(UNIT_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="label">N° de orden de venta</span>
                <input
                  className="input"
                  value={salesOrderNumber}
                  onChange={(event) => setSalesOrderNumber(event.target.value)}
                  placeholder="Número de orden"
                />
              </label>
            </div>
          )}
          {!loading && !picking && canSpecial && (
            <label className="flex items-center gap-2 rounded-lg border p-3 font-semibold">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={specialEnabled}
                disabled={!canEdit}
                onChange={(event) => toggleSpecial(event.target.checked)}
              />
              ESPECIAL
              <span className="text-xs font-normal text-muted-foreground">
                Catálogo ESP sin stock. Las cantidades se registran al guardar, imprimir o generar
                PDF.
              </span>
            </label>
          )}
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">Cargando…</p>
          ) : picking ? (
            <>
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-52 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    className="input pl-9"
                    placeholder="Buscar por descripción, SKU o categoría…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <select
                  className="input w-auto"
                  aria-label="Filtrar por categoría"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option value="">Todas las categorías</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                {selection.size} seleccionados · se muestran todos los productos, incluso sin stock.
              </p>
              <div className="overflow-x-auto rounded-lg border">
                <table className="table-base [&_td]:whitespace-nowrap">
                  <thead>
                    <tr>
                      <th className="w-10"></th>
                      <th>Descripción</th>
                      <th>Categoría</th>
                      <th className="text-right">Stock</th>
                      <th className="text-right">Costo unitario</th>
                      <th className="w-28">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProducts.map((p) => {
                      const checked = selection.has(p.id);
                      return (
                        <tr key={p.id}>
                          <td>
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              aria-label={`Seleccionar ${p.name}`}
                              checked={checked}
                              onChange={(event) => toggle(p.id, event.target.checked)}
                            />
                          </td>
                          <td className="whitespace-normal font-medium">{p.name}</td>
                          <td>
                            <span className="badge badge-muted">
                              {normalizeCubicationCategory(p.category)}
                            </span>
                          </td>
                          <td className="text-right">
                            <span className={p.stock <= 0 ? "font-semibold text-destructive" : ""}>
                              {p.stock.toLocaleString("es-CL")} {p.unit}
                            </span>
                          </td>
                          <td className="text-right">{money(p.unit_cost)}</td>
                          <td>
                            {checked && (
                              <input
                                className="input py-1"
                                inputMode="decimal"
                                aria-label={`Cantidad de ${p.name}`}
                                value={selection.get(p.id) ?? ""}
                                onChange={(event) => setQuantity(p.id, event.target.value)}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {visibleProducts.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-muted-foreground">
                          No hay productos que coincidan.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : !hasLines ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="mb-3 text-sm text-muted-foreground">
                Crea la lista de materiales para este tipo de unidad.
              </p>
              {canEdit ? (
                <button type="button" className="btn btn-primary" onClick={() => setPicking(true)}>
                  <Plus className="h-4 w-4" /> CREAR
                </button>
              ) : (
                <p className="text-sm">No tienes permiso para crear cubicaciones.</p>
              )}
            </div>
          ) : (
            <>
              <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">TOTAL MATERIALES</span>
                  <span className="font-display text-xl font-bold">{money(materialsTotal)}</span>
                </div>
              </div>
              {(specialLoadError || specialCatalogError) && (
                <p role="alert" className="text-destructive">
                  No se pudieron cargar los productos especiales. Recarga la página antes de guardar
                  o generar documentos.
                </p>
              )}
              {groups.map((group) => (
                <div key={group.category} className="overflow-x-auto rounded-lg border">
                  <table className="table-base [&_td]:whitespace-nowrap">
                    <thead>
                      <tr>
                        <th>Descripción</th>
                        <th>Categoría</th>
                        <th className="text-right">Stock</th>
                        <th className="text-right">Cantidad</th>
                        <th className="text-right">Costo unitario</th>
                        <th className="text-right">Subtotal</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.lines.map((line) => (
                        <tr
                          key={line.product.id}
                          className={line.isSpecial ? "bg-yellow-100 dark:bg-yellow-950/50" : ""}
                        >
                          <td className="whitespace-normal">
                            {line.isSpecial && line.specialId ? (
                              <SpecialProductSelector
                                value={
                                  specialItems.find((item) => item.id === line.specialId)
                                    ?.productId ?? ""
                                }
                                disabled={!specialEnabled || !canEdit || !canSpecial}
                                onSelect={(product) => selectSpecial(line.specialId!, product)}
                              />
                            ) : (
                              line.product.name
                            )}
                          </td>
                          <td>
                            {line.isSpecial && line.specialId ? (
                              <span className="badge badge-muted">
                                {normalizeCubicationCategory(line.product.category)}
                              </span>
                            ) : (
                              <span className="badge badge-muted">
                                {normalizeCubicationCategory(line.product.category)}
                              </span>
                            )}
                          </td>
                          <td className="text-right">
                            {line.isSpecial
                              ? "—"
                              : `${line.product.stock.toLocaleString("es-CL")} ${line.product.unit}`}
                          </td>
                          <td className="text-right">
                            {line.isSpecial && line.specialId ? (
                              <input
                                className="input w-24 bg-yellow-50 text-right dark:bg-yellow-950"
                                inputMode="decimal"
                                aria-label="Cantidad del ítem especial"
                                value={
                                  specialItems.find((item) => item.id === line.specialId)
                                    ?.quantity ?? ""
                                }
                                disabled={!specialEnabled || !canEdit}
                                onChange={(event) =>
                                  updateSpecialItem(line.specialId!, "quantity", event.target.value)
                                }
                              />
                            ) : (
                              `${line.quantity.toLocaleString("es-CL")} ${line.product.unit}`
                            )}
                          </td>
                          <td className="text-right">
                            {line.isSpecial && line.specialId ? (
                              <input
                                className="input w-32 bg-yellow-50 text-right dark:bg-yellow-950"
                                inputMode="decimal"
                                aria-label="Costo unitario del ítem especial"
                                value={
                                  specialItems.find((item) => item.id === line.specialId)
                                    ?.unitCost ?? ""
                                }
                                disabled={!specialEnabled || !canEdit}
                                onChange={(event) =>
                                  updateSpecialItem(line.specialId!, "unitCost", event.target.value)
                                }
                              />
                            ) : (
                              money(line.product.unit_cost)
                            )}
                          </td>
                          <td className="text-right">{money(line.subtotal)}</td>
                          <td>
                            {line.isSpecial && line.specialId && specialEnabled && canEdit && (
                              <button
                                type="button"
                                className="btn btn-ghost p-1.5"
                                aria-label="Eliminar ítem especial"
                                onClick={() => {
                                  setDirty(true);
                                  setSpecialItems((current) =>
                                    current.filter((item) => item.id !== line.specialId),
                                  );
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-muted font-semibold">
                        <td colSpan={6} className="text-right">
                          Subtotal {group.category}
                        </td>
                        <td className="text-right">{money(group.subtotal)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ))}

              {specialEnabled && canEdit && canSpecial && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setDirty(true);
                    setSpecialItems((current) => [
                      ...current,
                      newSpecialItem(CUBICATION_CATEGORIES[0]),
                    ]);
                  }}
                >
                  <Plus className="h-4 w-4" /> Agregar ítem especial
                </button>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <table className="table-base">
                    <tbody>
                      <tr>
                        <td className="font-semibold">TOTAL MATERIALES</td>
                        <td className="text-right font-semibold">{money(materialsTotal)}</td>
                      </tr>
                      {CUBICATION_COST_FIELDS.map((field) => (
                        <tr key={field.key}>
                          <td className="font-medium">{field.label}</td>
                          <td>
                            <NumericInput
                              className="input w-full min-w-32 text-right"
                              type="number"
                              min="0"
                              step="any"
                              inputMode="decimal"
                              aria-label={field.label}
                              placeholder=" "
                              value={costBreakdown[field.key]}
                              onChange={(event) => setCost(field.key, event.target.value)}
                              disabled={!canEdit}
                            />
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-muted text-base font-bold">
                        <td>COSTO TOTAL</td>
                        <td className="text-right">{money(totalCost)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="rounded-lg border-2 border-primary p-4">
                  <h3 className="mb-3 font-display text-lg font-bold">Valores de venta</h3>
                  <label className="mb-3 block space-y-1">
                    <span className="font-bold">VENTA PÚBLICO</span>
                    <NumericInput
                      className="input w-full text-right font-display text-xl font-bold"
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      aria-label="Venta público"
                      placeholder=" "
                      value={costBreakdown.publicPrice}
                      onChange={(event) => setCost("publicPrice", event.target.value)}
                      disabled={!canEdit}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="font-bold">VENTA DISTRIBUIDOR</span>
                    <NumericInput
                      className="input w-full text-right font-display text-xl font-bold"
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      aria-label="Venta distribuidor"
                      placeholder=" "
                      value={costBreakdown.distributorPrice}
                      onChange={(event) => setCost("distributorPrice", event.target.value)}
                      disabled={!canEdit}
                    />
                  </label>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {picking ? (
            <button type="button" className="btn btn-primary" onClick={() => setPicking(false)}>
              Aceptar selección ({selection.size})
            </button>
          ) : (
            <>
              {hasLines && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={exporting || save.isPending}
                    onClick={() => outputDocument(true)}
                  >
                    <Printer className="h-4 w-4" /> Imprimir
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={exporting || save.isPending}
                    onClick={() => outputDocument(false)}
                  >
                    <FileDown className="h-4 w-4" /> PDF
                  </button>
                </>
              )}
              {hasLines && canEdit && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setPicking(true)}
                >
                  <Pencil className="h-4 w-4" /> Editar lista
                </button>
              )}
              {hasLines && canEdit && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => save.mutate()}
                  disabled={save.isPending || exporting || specialLoadError || specialCatalogError}
                >
                  <Save className="h-4 w-4" /> {save.isPending ? "Guardando…" : "Guardar plantilla"}
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cerrar
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
