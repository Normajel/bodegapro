import { NumericInput } from "@/components/numeric-input";
import { useSpecialProducts } from "@/hooks/use-special-products";
import { canAccessSpecialProducts } from "@/lib/special-products";
import { useAppAccess, hasPermission } from "@/lib/permissions";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { FileDown, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { UNIT_TYPE_LABELS } from "@/lib/comprobante-pdf";
import {
  calculateCubicationTotal,
  CUBICATION_COST_FIELDS,
  EMPTY_CUBICATION_COSTS,
  groupByCategory,
  type CubicationLine,
  type CubicationCostBreakdown,
} from "@/lib/cubication";
import { downloadCubicationPdf, printCubicationPdf } from "@/lib/cubication-pdf";
import { money } from "@/lib/warehouse";

export const Route = createFileRoute("/_authenticated/documento-cubicacion")({
  head: () => ({
    meta: [
      { title: "Documento de cubicación — BodegaPro" },
      {
        name: "description",
        content: "Documento oficial para vendedores: tipo de unidad, unidad de cubicaje y valores.",
      },
    ],
  }),
  component: CubicationDocumentPage,
});

function CubicationDocumentPage() {
  const access = useAppAccess();
  const canSpecial =
    canAccessSpecialProducts(access?.name) &&
    hasPermission(access?.name, access?.permissions, "special_inventory");
  const {
    data: specialProducts = [],
    isLoading: specialProductsLoading,
    isError: specialProductsError,
  } = useSpecialProducts();
  const documentId = useRef(crypto.randomUUID());
  const [exporting, setExporting] = useState(false);
  const [unitCode, setUnitCode] = useState("");
  const [unitType, setUnitType] = useState("");
  const [client, setClient] = useState("");
  const [salesOrderNumber, setSalesOrderNumber] = useState("");
  const [costBreakdown, setCostBreakdown] =
    useState<CubicationCostBreakdown>(EMPTY_CUBICATION_COSTS);

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["cubication-template-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cubication_templates")
        .select("unit_code")
        .order("unit_code");
      if (error) throw error;
      return data.map((row) => row.unit_code);
    },
  });

  const { data: template, isLoading: templateLoading } = useQuery({
    queryKey: ["cubication-document", unitCode],
    enabled: Boolean(unitCode),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cubication_templates")
        .select(
          "*, cubication_template_items(quantity, products(id, name, sku, category, unit, stock, stock_quantity, unit_cost))",
        )
        .eq("unit_code", unitCode)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const {
    data: specialItems = [],
    isLoading: specialItemsLoading,
    isError: specialItemsError,
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
  const specialLines = useMemo<CubicationLine[]>(
    () =>
      specialItems.flatMap((item) => {
        const p = specialProducts.find((p) => p.id === item.special_product_id);
        return p
          ? [
              {
                isSpecial: true,
                specialId: item.line_id,
                quantity: item.quantity,
                product: {
                  id: item.line_id,
                  name: p.name,
                  sku: p.sku,
                  category: p.category,
                  unit: p.unit,
                  stock: 0,
                  unit_cost: item.unit_cost,
                },
              },
            ]
          : [];
      }),
    [specialItems, specialProducts],
  );

  const lines = useMemo<CubicationLine[]>(
    () =>
      (template?.cubication_template_items ?? []).flatMap((item) => {
        const p = item.products;
        if (!p) return [];
        return [
          {
            quantity: Number(item.quantity) || 0,
            product: {
              id: p.id,
              name: p.name,
              sku: p.sku,
              category: p.category,
              unit: p.unit,
              stock: Number(p.stock_quantity ?? p.stock) || 0,
              unit_cost: Number(p.unit_cost) || 0,
            },
          },
        ];
      }),
    [template],
  );
  const groups = useMemo(() => groupByCategory([...lines, ...specialLines]), [lines, specialLines]);
  const materialsTotal = groups.reduce((sum, group) => sum + group.subtotal, 0);
  const totalCost = calculateCubicationTotal(materialsTotal, costBreakdown);
  const printData = {
    client,
    unitTypeLabel: UNIT_TYPE_LABELS[unitType] ?? unitType,
    salesOrderNumber,
    unitCode,
    groups,
    costBreakdown,
  };

  async function outputDocument(print: boolean) {
    if (!unitType) {
      toast.error("Selecciona el tipo de unidad antes de generar el documento");
      return;
    }
    if (specialItemsError || specialProductsError || specialLines.length !== specialItems.length) {
      toast.error("No se pudieron cargar los productos especiales");
      return;
    }
    let target: Window | null = null;
    if (print) {
      target = window.open("", "_blank");
      if (!target) {
        toast.error("Permite las ventanas emergentes para imprimir");
        return;
      }
    }
    setExporting(true);
    try {
      if (canSpecial && specialItems.length) {
        const { error } = await supabase.rpc("save_special_cubication", {
          p_document_id: documentId.current,
          p_unit_code: unitCode,
          p_context: { client, unitType, salesOrderNumber, costBreakdown },
          p_lines: specialItems.map((item) => ({
            line_id: item.line_id,
            special_product_id: item.special_product_id,
            quantity: item.quantity,
            unit_cost: item.unit_cost,
          })),
        });
        if (error) throw error;
      }
      if (print) printCubicationPdf(printData, target);
      else downloadCubicationPdf(printData);
    } catch (error) {
      target?.close();
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
    <main className="mx-auto w-full max-w-4xl space-y-4 px-2 py-4 sm:px-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documento de cubicación</h1>
        <p className="text-sm text-muted-foreground">
          Asocia una planilla de cubicación a un tipo de unidad e imprime el documento para los
          vendedores.
        </p>
      </div>

      <div className="card grid gap-3 p-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="doc-client">
            Cliente
          </label>
          <input
            id="doc-client"
            className="input"
            value={client}
            onChange={(event) => setClient(event.target.value)}
            placeholder="Nombre del cliente"
          />
        </div>
        <div>
          <label className="label" htmlFor="doc-unit-type">
            Tipo de unidad
          </label>
          <select
            id="doc-unit-type"
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
        </div>
        <div>
          <label className="label" htmlFor="doc-sales-order">
            N° de orden de venta
          </label>
          <input
            id="doc-sales-order"
            className="input"
            value={salesOrderNumber}
            onChange={(event) => setSalesOrderNumber(event.target.value)}
            placeholder="Número de orden"
          />
        </div>
        <div>
          <label className="label" htmlFor="doc-unit">
            Unidad de cubicaje
          </label>
          <select
            id="doc-unit"
            className="input"
            value={unitCode}
            disabled={templatesLoading}
            onChange={(event) => {
              setUnitCode(event.target.value);
              documentId.current = crypto.randomUUID();
            }}
          >
            <option value="">
              {templates.length === 0 && !templatesLoading
                ? "No hay planillas guardadas"
                : "Selecciona una planilla…"}
            </option>
            {templates.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
      </div>

      {unitCode && (
        <div className="card space-y-4 p-4">
          {templateLoading || specialProductsLoading || specialItemsLoading ? (
            <p className="py-6 text-center text-muted-foreground">Cargando…</p>
          ) : groups.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">
              Esta planilla no tiene ítems. Edítala en Cubicación.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Tipo de unidad</p>
                  <p className="font-display text-lg font-bold">{printData.unitTypeLabel}</p>
                  <p className="text-sm text-muted-foreground">Unidad de cubicaje</p>
                  <p className="font-display text-lg font-bold">{unitCode}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={exporting}
                    onClick={() => outputDocument(true)}
                  >
                    <Printer className="h-4 w-4" /> Imprimir
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={exporting}
                    onClick={() => outputDocument(false)}
                  >
                    <FileDown className="h-4 w-4" /> PDF
                  </button>
                </div>
              </div>

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
                        <th colSpan={5}>{group.category}</th>
                      </tr>
                      <tr>
                        <th>Descripción</th>
                        <th className="text-right">Stock</th>
                        <th className="text-right">Cantidad</th>
                        <th className="text-right">Costo unitario</th>
                        <th className="text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.lines.map((line) => (
                        <tr
                          key={line.product.id}
                          className={line.isSpecial ? "bg-yellow-100 dark:bg-yellow-950/50" : ""}
                        >
                          <td className="whitespace-normal">{line.product.name}</td>
                          <td className="text-right">
                            {line.isSpecial
                              ? "—"
                              : `${line.product.stock.toLocaleString("es-CL")} ${line.product.unit}`}
                          </td>
                          <td className="text-right">
                            {line.quantity.toLocaleString("es-CL")} {line.product.unit}
                          </td>
                          <td className="text-right">{money(line.product.unit_cost)}</td>
                          <td className="text-right">{money(line.subtotal)}</td>
                        </tr>
                      ))}
                      <tr className="bg-muted font-semibold">
                        <td colSpan={4} className="text-right">
                          Subtotal {group.category}
                        </td>
                        <td className="text-right">{money(group.subtotal)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ))}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <table className="table-base">
                    <tbody>
                      <tr>
                        <td className="font-semibold">TOTAL MATERIALES</td>
                        <td className="text-right">{money(materialsTotal)}</td>
                      </tr>
                      {CUBICATION_COST_FIELDS.map((field) => {
                        return (
                          <tr key={field.key}>
                            <td>{field.label}</td>
                            <td>
                              <NumericInput
                                className="input min-w-32 text-right"
                                type="number"
                                min="0"
                                step="any"
                                inputMode="decimal"
                                aria-label={field.label}
                                placeholder=" "
                                value={costBreakdown[field.key]}
                                onChange={(event) =>
                                  setCostBreakdown((current) => ({
                                    ...current,
                                    [field.key]: event.target.value,
                                  }))
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-muted font-bold">
                        <td>COSTO TOTAL</td>
                        <td className="text-right">{money(totalCost)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="rounded-lg border-2 border-primary p-4">
                  <h2 className="mb-3 font-display text-lg font-bold">Valores de venta</h2>
                  <table className="table-base">
                    <tbody>
                      <tr className="bg-primary/10 font-bold">
                        <td>VENTA PÚBLICO</td>
                        <td>
                          <NumericInput
                            className="input text-right"
                            type="number"
                            min="0"
                            step="any"
                            inputMode="decimal"
                            aria-label="Venta público"
                            placeholder=" "
                            value={costBreakdown.publicPrice}
                            onChange={(event) =>
                              setCostBreakdown((current) => ({
                                ...current,
                                publicPrice: event.target.value,
                              }))
                            }
                          />
                        </td>
                      </tr>
                      <tr className="bg-primary/10 font-bold">
                        <td>VENTA DISTRIBUIDOR</td>
                        <td>
                          <NumericInput
                            className="input text-right"
                            type="number"
                            min="0"
                            step="any"
                            inputMode="decimal"
                            aria-label="Venta distribuidor"
                            placeholder=" "
                            value={costBreakdown.distributorPrice}
                            onChange={(event) =>
                              setCostBreakdown((current) => ({
                                ...current,
                                distributorPrice: event.target.value,
                              }))
                            }
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Los datos de stock y costo unitario se muestran como referencia de inventario; esta
                planilla y su impresión no modifican existencias.
              </p>
            </>
          )}
        </div>
      )}
    </main>
  );
}
