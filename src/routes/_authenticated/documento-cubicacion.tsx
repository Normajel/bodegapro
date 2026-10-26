import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileDown, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { UNIT_TYPE_LABELS } from "@/lib/comprobante-pdf";
import { computeCosts, groupByCategory, type CubicationLine } from "@/lib/cubication";
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
  const params = {
    otherCosts: Number(template?.other_costs) || 0,
    adminPct: Number(template?.admin_pct) || 0,
    retailMarginPct: Number(template?.retail_margin_pct) || 0,
    distributorMarginPct: Number(template?.distributor_margin_pct) || 0,
  };
  const costs = computeCosts(groups, params);
  const pdfData = {
    unitTypeLabel: UNIT_TYPE_LABELS[unitType] ?? unitType,
    unitCode,
    groups,
    params,
  };

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 px-2 py-4 sm:px-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documento de cubicación</h1>
        <p className="text-sm text-muted-foreground">
          Asocia una planilla de cubicación a un tipo de unidad y genera el PDF para los vendedores.
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
                  <p className="font-display text-lg font-bold">{pdfData.unitTypeLabel}</p>
                  <p className="text-sm text-muted-foreground">Unidad de cubicaje</p>
                  <p className="font-display text-lg font-bold">{unitCode}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => downloadCubicationPdf(pdfData)}
                  >
                    <FileDown className="h-4 w-4" /> Descargar PDF
                  </button>
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
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <table className="table-base [&_td]:whitespace-nowrap">
                  <tbody>
                    {groups.map((group) => (
                      <tr key={group.category}>
                        <td className="font-semibold">{group.category}</td>
                        <td className="text-right text-muted-foreground">
                          {group.lines.length} ítems
                        </td>
                        <td className="text-right font-semibold">{money(group.subtotal)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={2} className="font-semibold">
                        TOTAL MATERIALES
                      </td>
                      <td className="text-right">{money(costs.materials)}</td>
                    </tr>
                    <tr>
                      <td colSpan={2}>COSTO DE FABRICACIÓN</td>
                      <td className="text-right">{money(costs.fabrication)}</td>
                    </tr>
                    <tr>
                      <td colSpan={2}>COSTO ADMINISTRATIVO ({params.adminPct}%)</td>
                      <td className="text-right">{money(costs.administrative)}</td>
                    </tr>
                    <tr className="bg-muted font-bold">
                      <td colSpan={2}>COSTO TOTAL</td>
                      <td className="text-right">{money(costs.total)}</td>
                    </tr>
                    <tr className="bg-primary/20 font-bold">
                      <td colSpan={2}>VENTA PÚBLICO</td>
                      <td className="text-right">{money(costs.retailPrice)}</td>
                    </tr>
                    <tr className="bg-primary/20 font-bold">
                      <td colSpan={2}>VENTA DISTRIBUIDOR</td>
                      <td className="text-right">{money(costs.distributorPrice)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                El PDF incluye el detalle de cada ítem, agrupado por categoría, y la fecha de
                emisión. Los valores usan los costos actuales del inventario.
              </p>
            </>
          )}
        </div>
      )}
    </main>
  );
}
