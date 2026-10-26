import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, Pencil, Plus, Printer, Save, Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  computeCosts,
  groupByCategory,
  type CubicationLine,
  type CubicationProduct,
} from "@/lib/cubication";
import { hasPermission, useAppAccess } from "@/lib/permissions";
import { money } from "@/lib/warehouse";
import { UNIT_TYPE_LABELS } from "@/lib/comprobante-pdf";
import { downloadCubicationPdf, printCubicationPdf } from "@/lib/cubication-pdf";

const DEFAULT_PARAMS = { otherCosts: "0", adminPct: "10", retailPct: "30", distributorPct: "15" };

function toNumber(value: string) {
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}

export function CubicationWindow({
  unitType,
  unitCode,
  onClose,
}: {
  unitType: string;
  unitCode: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const access = useAppAccess();
  const canEdit = hasPermission(access?.name, access?.permissions, "movements", "edit");

  const [picking, setPicking] = useState(false);
  const [selection, setSelection] = useState<Map<string, string>>(new Map());
  const [params, setParams] = useState(DEFAULT_PARAMS);
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
    queryKey: ["cubication-template", unitType, unitCode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cubication_templates")
        .select("*, cubication_template_items(product_id, quantity)")
        .eq("unit_type", unitType)
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
      setParams(DEFAULT_PARAMS);
      return;
    }
    setSelection(
      new Map(
        template.cubication_template_items.map((item) => [item.product_id, String(item.quantity)]),
      ),
    );
    setParams({
      otherCosts: String(template.other_costs),
      adminPct: String(template.admin_pct),
      retailPct: String(template.retail_margin_pct),
      distributorPct: String(template.distributor_margin_pct),
    });
  }, [template, unitType, unitCode]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(),
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
  const groups = useMemo(() => groupByCategory(lines), [lines]);
  const costs = computeCosts(groups, {
    otherCosts: toNumber(params.otherCosts),
    adminPct: toNumber(params.adminPct),
    retailMarginPct: toNumber(params.retailPct),
    distributorMarginPct: toNumber(params.distributorPct),
  });

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
        p_unit_type: unitType,
        p_unit_code: unitCode,
        p_other_costs: toNumber(params.otherCosts),
        p_admin_pct: toNumber(params.adminPct),
        p_retail_margin_pct: toNumber(params.retailPct),
        p_distributor_margin_pct: toNumber(params.distributorPct),
        p_items: items,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Cubicación guardada");
      setDirty(false);
      await queryClient.invalidateQueries({
        queryKey: ["cubication-template", unitType, unitCode],
      });
    },
    onError: (error) => {
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : "";
      toast.error(
        /schema cache|could not find the function|does not exist/i.test(message)
          ? "Falta aplicar la migración 0024 (cubicaciones) en Supabase."
          : message || "No se pudo guardar la cubicación",
      );
    },
  });

  const pdfData = {
    unitTypeLabel: UNIT_TYPE_LABELS[unitType] ?? unitType,
    unitCode,
    groups,
    params: {
      otherCosts: toNumber(params.otherCosts),
      adminPct: toNumber(params.adminPct),
      retailMarginPct: toNumber(params.retailPct),
      distributorMarginPct: toNumber(params.distributorPct),
    },
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

  const setParam = (key: keyof typeof DEFAULT_PARAMS, value: string) => {
    setDirty(true);
    setParams((current) => ({ ...current, [key]: value }));
  };

  const loading = productsLoading || templateLoading;
  const hasLines = lines.length > 0;

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
              Cubicación · {UNIT_TYPE_LABELS[unitType] ?? unitType} · {unitCode}
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
              {groups.map((group) => (
                <div key={group.category} className="overflow-x-auto rounded-lg border">
                  <table className="table-base [&_td]:whitespace-nowrap">
                    <thead>
                      <tr>
                        <th>{group.category}</th>
                        <th className="text-right">Cantidad</th>
                        <th className="text-right">Costo unitario</th>
                        <th className="text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.lines.map((line) => (
                        <tr key={line.product.id}>
                          <td className="whitespace-normal">{line.product.name}</td>
                          <td className="text-right">
                            {line.quantity.toLocaleString("es-CL")} {line.product.unit}
                          </td>
                          <td className="text-right">{money(line.product.unit_cost)}</td>
                          <td className="text-right">{money(line.subtotal)}</td>
                        </tr>
                      ))}
                      <tr className="bg-muted font-semibold">
                        <td colSpan={3} className="text-right">
                          Subtotal {group.category}
                        </td>
                        <td className="text-right">{money(group.subtotal)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ))}

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <table className="table-base">
                    <tbody>
                      <tr>
                        <td className="font-semibold">TOTAL MATERIALES</td>
                        <td className="text-right">{money(costs.materials)}</td>
                      </tr>
                      <tr>
                        <td>
                          <label className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">COSTO DE FABRICACIÓN</span>
                            <span className="text-xs text-muted-foreground">
                              (materiales + otros costos
                            </span>
                            <input
                              className="input w-28 py-1"
                              inputMode="decimal"
                              aria-label="Otros costos"
                              value={params.otherCosts}
                              onChange={(event) => setParam("otherCosts", event.target.value)}
                              disabled={!canEdit}
                            />
                            <span className="text-xs text-muted-foreground">)</span>
                          </label>
                        </td>
                        <td className="text-right">{money(costs.fabrication)}</td>
                      </tr>
                      <tr>
                        <td>
                          <label className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">COSTO ADMINISTRATIVO</span>
                            <input
                              className="input w-20 py-1"
                              inputMode="decimal"
                              aria-label="Porcentaje administrativo"
                              value={params.adminPct}
                              onChange={(event) => setParam("adminPct", event.target.value)}
                              disabled={!canEdit}
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </label>
                        </td>
                        <td className="text-right">{money(costs.administrative)}</td>
                      </tr>
                      <tr className="bg-muted text-base font-bold">
                        <td>COSTO TOTAL</td>
                        <td className="text-right">{money(costs.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="rounded-lg border-2 border-primary p-4">
                  <table className="table-base">
                    <tbody>
                      <tr>
                        <td>
                          <label className="flex flex-wrap items-center gap-2">
                            <span className="font-bold">VENTA PÚBLICO</span>
                            <input
                              className="input w-20 py-1"
                              inputMode="decimal"
                              aria-label="Margen venta público"
                              value={params.retailPct}
                              onChange={(event) => setParam("retailPct", event.target.value)}
                              disabled={!canEdit}
                            />
                            <span className="text-xs text-muted-foreground">% margen</span>
                          </label>
                        </td>
                        <td className="text-right font-display text-xl font-bold">
                          {money(costs.retailPrice)}
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <label className="flex flex-wrap items-center gap-2">
                            <span className="font-bold">VENTA DISTRIBUIDOR</span>
                            <input
                              className="input w-20 py-1"
                              inputMode="decimal"
                              aria-label="Margen venta distribuidor"
                              value={params.distributorPct}
                              onChange={(event) => setParam("distributorPct", event.target.value)}
                              disabled={!canEdit}
                            />
                            <span className="text-xs text-muted-foreground">% margen</span>
                          </label>
                        </td>
                        <td className="text-right font-display text-xl font-bold">
                          {money(costs.distributorPrice)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
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
                  onClick={() => downloadCubicationPdf(pdfData)}
                >
                  <FileDown className="h-4 w-4" /> PDF
                </button>
              )}
              {hasLines && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    try {
                      printCubicationPdf(pdfData);
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "No se pudo imprimir");
                    }
                  }}
                >
                  <Printer className="h-4 w-4" /> Imprimir
                </button>
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
