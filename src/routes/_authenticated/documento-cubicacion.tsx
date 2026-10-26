import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { UNIT_TYPE_LABELS } from "@/lib/comprobante-pdf";
import {
  calculateCubicationTotal,
  CUBICATION_COST_FIELDS,
  groupByCategory,
  normalizeCubicationCostBreakdown,
  type CubicationLine,
} from "@/lib/cubication";
import { printCubicationPdf } from "@/lib/cubication-pdf";
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
  const [unitCode, setUnitCode] = useState("");
  const [unitType, setUnitType] = useState("stock");

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
  const groups = useMemo(() => groupByCategory(lines), [lines]);
  const costBreakdown = normalizeCubicationCostBreakdown(template?.cost_breakdown);
  const materialsTotal = groups.reduce((sum, group) => sum + group.subtotal, 0);
  const totalCost = calculateCubicationTotal(materialsTotal, costBreakdown);
  const printData = {
    unitTypeLabel: UNIT_TYPE_LABELS[unitType] ?? unitType,
    unitCode,
    groups,
    costBreakdown,
  };

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
          <label className="label" htmlFor="doc-unit-type">
            Tipo de unidad
          </label>
          <select
            id="doc-unit-type"
            className="input"
            value={unitType}
            onChange={(event) => setUnitType(event.target.value)}
          >
            {Object.entries(UNIT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
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
            onChange={(event) => setUnitCode(event.target.value)}
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
          {templateLoading ? (
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
                    className="btn btn-primary"
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
                        <tr key={line.product.id}>
                          <td className="whitespace-normal">{line.product.name}</td>
                          <td className="text-right">
                            {line.product.stock.toLocaleString("es-CL")} {line.product.unit}
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
                        const value = costBreakdown[field.key].trim();
                        const amount = Number(value.replace(",", "."));
                        return (
                          <tr key={field.key}>
                            <td>{field.label}</td>
                            <td className="text-right">
                              {value && Number.isFinite(amount) ? money(amount) : "—"}
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
                        <td className="text-right">
                          {costBreakdown.publicPrice.trim()
                            ? money(Number(costBreakdown.publicPrice.replace(",", ".")) || 0)
                            : "—"}
                        </td>
                      </tr>
                      <tr className="bg-primary/10 font-bold">
                        <td>VENTA DISTRIBUIDOR</td>
                        <td className="text-right">
                          {costBreakdown.distributorPrice.trim()
                            ? money(Number(costBreakdown.distributorPrice.replace(",", ".")) || 0)
                            : "—"}
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
