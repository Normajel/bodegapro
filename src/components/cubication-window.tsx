import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Printer, Save, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  calculateCubicationTotal,
  CUBICATION_COST_FIELDS,
  EMPTY_CUBICATION_COSTS,
  groupByCategory,
  normalizeCubicationCostBreakdown,
  type CubicationLine,
  type CubicationCostBreakdown,
  type CubicationProduct,
} from "@/lib/cubication";
import { hasPermission, useAppAccess } from "@/lib/permissions";
import { CATEGORIES, money } from "@/lib/warehouse";
import { printCubicationPdf } from "@/lib/cubication-pdf";

type SpecialItem = {
  id: string;
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
    description: "",
    category,
    unitCost: "",
    quantity: "",
  };
}

export function CubicationWindow({ unitCode, onClose }: { unitCode: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const access = useAppAccess();
  const canEdit = hasPermission(access?.name, access?.permissions, "movements", "edit");

  const [picking, setPicking] = useState(false);
  const [selection, setSelection] = useState<Map<string, string>>(new Map());
  const [costBreakdown, setCostBreakdown] =
    useState<CubicationCostBreakdown>(EMPTY_CUBICATION_COSTS);
  const [specialEnabled, setSpecialEnabled] = useState(false);
  const [specialItems, setSpecialItems] = useState<SpecialItem[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [dirty, setDirty] = useState(false);

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

  useEffect(() => {
    setDirty(false);
    setPicking(false);
    if (!template) {
      setSelection(new Map());
      setCostBreakdown({ ...EMPTY_CUBICATION_COSTS });
      setSpecialEnabled(false);
      setSpecialItems([]);
      return;
    }
    setSelection(
      new Map(
        template.cubication_template_items.map((item) => [item.product_id, String(item.quantity)]),
      ),
    );
    setCostBreakdown(normalizeCubicationCostBreakdown(template.cost_breakdown));
    setSpecialEnabled(false);
    setSpecialItems([]);
  }, [template, unitCode]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const categories = useMemo(
    () => [...new Set([...CATEGORIES, ...products.map((p) => p.category).filter(Boolean)])].sort(),
    [products],
  );

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
          sku: "",
          category: item.category,
          unit: "",
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
        (!category || p.category === category) &&
        (!term || `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(term)),
    );
  }, [products, search, category]);

  const save = useMutation({
    mutationFn: async () => {
      const items = lines
        .filter((line) => line.quantity > 0)
        .map((line) => ({ product_id: line.product.id, quantity: line.quantity }));
      if (items.length === 0) throw new Error("Selecciona al menos un ítem con cantidad mayor a 0");
      const { error } = await supabase.rpc("save_cubication_template", {
        p_unit_code: unitCode,
        p_other_costs: 0,
        p_admin_pct: 0,
        p_retail_margin_pct: 0,
        p_distributor_margin_pct: 0,
        p_items: items,
        p_cost_breakdown: costBreakdown,
      });
      if (error) throw error;
    },
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
          ? `Falta aplicar la migración 0029 (costos de cubicación) en Supabase. Detalle: ${message}`
          : message || "No se pudo guardar la cubicación",
      );
    },
  });

  const printData = {
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
    setDirty(true);
    setCostBreakdown((current) => ({ ...current, [key]: value }));
  };

  const loading = productsLoading || templateLoading;
  const hasLines = lines.length > 0 || specialLines.length > 0;

  function toggleSpecial(checked: boolean) {
    setSpecialEnabled(checked);
    if (checked && specialItems.length === 0) {
      setSpecialItems([newSpecialItem(CATEGORIES[0])]);
    }
  }

  function updateSpecialItem(id: string, key: keyof Omit<SpecialItem, "id">, value: string) {
    setSpecialItems((current) =>
      current.map((item) => (item.id === id ? { ...item, [key]: value } : item)),
    );
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-2 sm:p-4"
      onClick={onClose}
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
                Los ítems especiales son temporales y no se guardan en la plantilla.
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
                            <span className="badge badge-muted">{p.category}</span>
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
                              <input
                                className="input min-w-48 bg-yellow-50 dark:bg-yellow-950"
                                aria-label="Descripción del ítem especial"
                                placeholder="Descripción"
                                value={
                                  specialItems.find((item) => item.id === line.specialId)
                                    ?.description ?? ""
                                }
                                disabled={!specialEnabled || !canEdit}
                                onChange={(event) =>
                                  updateSpecialItem(
                                    line.specialId!,
                                    "description",
                                    event.target.value,
                                  )
                                }
                              />
                            ) : (
                              line.product.name
                            )}
                          </td>
                          <td>
                            {line.isSpecial && line.specialId ? (
                              <select
                                className="input min-w-40 bg-yellow-50 dark:bg-yellow-950"
                                aria-label="Categoría del ítem especial"
                                value={line.product.category}
                                disabled={!specialEnabled || !canEdit}
                                onChange={(event) =>
                                  updateSpecialItem(line.specialId!, "category", event.target.value)
                                }
                              >
                                {categories.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="badge badge-muted">{line.product.category}</span>
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
                                onClick={() =>
                                  setSpecialItems((current) =>
                                    current.filter((item) => item.id !== line.specialId),
                                  )
                                }
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

              {specialEnabled && canEdit && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    setSpecialItems((current) => [...current, newSpecialItem(CATEGORIES[0])])
                  }
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
                            <input
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
                    <input
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
                    <input
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
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    try {
                      printCubicationPdf(printData);
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "No se pudo imprimir");
                    }
                  }}
                >
                  <Printer className="h-4 w-4" /> Imprimir
                </button>
              )}
              {lines.length > 0 && canEdit && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setPicking(true)}
                >
                  <Pencil className="h-4 w-4" /> Editar lista
                </button>
              )}
              {lines.length > 0 && canEdit && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => save.mutate()}
                  disabled={save.isPending || (!dirty && Boolean(template))}
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
