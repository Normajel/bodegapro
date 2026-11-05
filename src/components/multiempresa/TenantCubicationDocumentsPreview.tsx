import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/lib/multiempresa/database.types";
import { useActiveCompany } from "@/lib/multiempresa/company-context";
import { listTenantCubicationCatalog, tenantQueryKeys } from "@/lib/multiempresa/tenant-catalog";
import {
  downloadTenantCubicationPdf,
  moneyCLP,
  summarizeTenantCubicationDocument,
  type TenantDocumentLine,
} from "@/lib/multiempresa/cubication-document";

const db = supabase as unknown as SupabaseClient<Database>;

async function loadCompanyDocument(companyId: string, kind: "normal" | "especial", id: string) {
  const empty = { client: "", unitType: "", reference: "" };
  if (kind === "normal") {
    const { data, error } = await db
      .from("cubication_template_items")
      .select("id,product_id,quantity")
      .eq("company_id", companyId)
      .eq("template_id", id)
      .limit(1001);
    if (error) throw error;
    if ((data?.length ?? 0) > 1000) throw new Error("Documento demasiado grande.");
    const ids = [...new Set((data ?? []).map((line) => line.product_id))];
    const detail = ids.length
      ? await db
          .from("products")
          .select("id,name,category,unit,stock_quantity,unit_cost")
          .eq("company_id", companyId)
          .in("id", ids)
          .limit(1001)
      : { data: [], error: null };
    if (detail.error) throw detail.error;
    const byId = new Map((detail.data ?? []).map((p) => [p.id, p]));
    const lines: TenantDocumentLine[] = (data ?? []).map((line) => {
      const p = byId.get(line.product_id);
      if (!p) throw new Error("El documento contiene productos que no pueden consultarse.");
      return {
        id: line.id,
        name: p.name,
        category: p.category,
        unit: p.unit,
        quantity: Number(line.quantity),
        stock: Number(p.stock_quantity),
        unitCost: Number(p.unit_cost),
        isSpecial: false,
      };
    });
    return { lines, context: empty };
  }
  const [document, detail] = await Promise.all([
    db
      .from("special_cubication_documents")
      .select("context")
      .eq("company_id", companyId)
      .eq("id", id)
      .single(),
    db
      .from("special_cubication_lines")
      .select("line_id,special_product_id,quantity,unit_cost")
      .eq("company_id", companyId)
      .eq("document_id", id)
      .limit(1001),
  ]);
  if (document.error) throw document.error;
  if (detail.error) throw detail.error;
  if ((detail.data?.length ?? 0) > 1000) throw new Error("Documento demasiado grande.");
  const ids = [...new Set((detail.data ?? []).map((line) => line.special_product_id))];
  const products = ids.length
    ? await db
        .from("special_products")
        .select("id,name,category,unit")
        .eq("company_id", companyId)
        .in("id", ids)
        .limit(1001)
    : { data: [], error: null };
  if (products.error) throw products.error;
  const byId = new Map((products.data ?? []).map((p) => [p.id, p]));
  const lines: TenantDocumentLine[] = (detail.data ?? []).map((line) => {
    const p = byId.get(line.special_product_id);
    if (!p) throw new Error("El documento contiene productos especiales no disponibles.");
    return {
      id: line.line_id,
      name: p.name,
      category: p.category,
      unit: p.unit,
      quantity: Number(line.quantity),
      unitCost: Number(line.unit_cost),
      stock: null,
      isSpecial: true,
    };
  });
  const ctx = document.data.context;
  const context = ctx && typeof ctx === "object" && !Array.isArray(ctx) ? ctx : {};
  const text = (key: string) => (typeof context[key] === "string" ? context[key] : "");
  return {
    lines,
    context: {
      client: text("client"),
      unitType: text("unitType"),
      reference: text("salesOrderNumber"),
    },
  };
}

/** Saved documents are readable independently of cubicacion editing rights. */
export function TenantCubicationDocumentsPreview() {
  const companyId = useActiveCompany();
  const [selection, setSelection] = useState("");
  const [client, setClient] = useState("");
  const [unitType, setUnitType] = useState("");
  const [reference, setReference] = useState("");
  const catalog = useQuery({
    queryKey: tenantQueryKeys.cubicationCatalog(companyId ?? ""),
    enabled: !!companyId,
    queryFn: () => listTenantCubicationCatalog(companyId!),
    staleTime: 0,
  });
  const chosen = catalog.data?.find((document) => `${document.kind}:${document.id}` === selection);
  const detail = useQuery({
    queryKey: ["tenant", companyId ?? "", "cubication-document-full", selection],
    enabled: !!companyId && !!chosen,
    queryFn: () => loadCompanyDocument(companyId!, chosen!.kind, chosen!.id),
    staleTime: 0,
  });
  const lines = detail.data?.lines ?? [];
  let totals: ReturnType<typeof summarizeTenantCubicationDocument> | null = null;
  let dataError = "";
  try {
    if (detail.isSuccess) totals = summarizeTenantCubicationDocument(lines);
  } catch (error) {
    dataError = error instanceof Error ? error.message : "Documento inválido.";
  }

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-8">
      <h1 className="text-2xl font-bold">Documento de cubicación</h1>
      <p className="text-sm text-slate-600">
        Consulta unidades de cubicaje guardadas, incluso si tu perfil no puede crear o editar
        cubicaciones. La información se limita a la empresa seleccionada.
      </p>
      {!companyId && <p role="status">Selecciona una empresa.</p>}
      {companyId && catalog.isPending && <p role="status">Consultando unidades guardadas…</p>}
      {catalog.isError && <p role="alert">No se pudieron cargar las unidades guardadas.</p>}
      {companyId && catalog.isSuccess && (
        <section className="grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Unidad de cubicaje
            <select
              value={selection}
              className="mt-1 block w-full rounded border p-2"
              onChange={(e) => {
                setSelection(e.target.value);
                setClient("");
                setUnitType("");
                setReference("");
              }}
            >
              <option value="">Selecciona una unidad guardada</option>
              {catalog.data.map((item) => (
                <option key={item.kind + ":" + item.id} value={item.kind + ":" + item.id}>
                  {item.unit_code} · {item.kind === "especial" ? "Especial" : "Normal"}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Cliente (opcional)
            <input
              value={client}
              onChange={(e) => setClient(e.target.value)}
              className="mt-1 block w-full rounded border p-2"
              maxLength={100}
              placeholder={detail.data?.context.client || "Cliente"}
            />
          </label>
          <label className="text-sm font-semibold">
            Tipo de unidad
            <input
              value={unitType}
              onChange={(e) => setUnitType(e.target.value)}
              className="mt-1 block w-full rounded border p-2"
              maxLength={80}
              placeholder={detail.data?.context.unitType || "Tipo de unidad"}
            />
          </label>
          <label className="text-sm font-semibold">
            N° de orden de venta o NV
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="mt-1 block w-full rounded border p-2"
              maxLength={80}
              placeholder={detail.data?.context.reference || "Referencia"}
            />
          </label>
          {catalog.data.length === 0 && (
            <p className="text-sm text-slate-600">No hay unidades guardadas para esta empresa.</p>
          )}
        </section>
      )}
      {chosen && detail.isPending && <p role="status">Cargando materiales…</p>}
      {chosen && detail.isError && (
        <p role="alert">No se pudo consultar el detalle completo de esta unidad.</p>
      )}
      {dataError && <p role="alert">{dataError}</p>}
      {chosen && totals && (
        <section className="space-y-4 rounded-lg border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{chosen.unit_code}</h2>
              <p className="text-xs text-slate-600">
                Guardada: {new Date(chosen.created_at).toLocaleDateString("es-CL")}
              </p>
            </div>
            <button
              type="button"
              disabled={!lines.length}
              className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() =>
                downloadTenantCubicationPdf(chosen.unit_code, lines, {
                  client: client || detail.data?.context.client || "",
                  unitType: unitType || detail.data?.context.unitType || "",
                  reference: reference || detail.data?.context.reference || "",
                })
              }
            >
              Descargar PDF
            </button>
          </div>
          {totals.missingPrices > 0 && (
            <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">
              {totals.missingPrices} material(es) sin costo registrado. El total puede estar
              incompleto.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-2">Descripción</th>
                  <th className="p-2">Categoría</th>
                  <th className="p-2">Stock</th>
                  <th className="p-2">Cantidad</th>
                  <th className="p-2">Costo unitario</th>
                  <th className="p-2">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr
                    key={line.id}
                    className={line.isSpecial ? "border-t bg-amber-50" : "border-t"}
                  >
                    <td className="p-2">{line.name}</td>
                    <td className="p-2">{line.category}</td>
                    <td className="p-2">{line.isSpecial ? "Sin stock" : line.stock}</td>
                    <td className="p-2">
                      {line.quantity} {line.unit}
                    </td>
                    <td className="p-2">{moneyCLP(line.unitCost)}</td>
                    <td className="p-2">{moneyCLP(line.unitCost * line.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lines.length === 0 && (
            <p className="text-sm text-slate-600">Esta unidad no tiene materiales guardados.</p>
          )}
          <div className="flex justify-between border-t pt-3 font-bold">
            <span>Total materiales</span>
            <span>{moneyCLP(totals.total)}</span>
          </div>
          <p className="text-xs text-slate-600">
            Consulta y exportación solamente: no crea compras, no edita cubicaciones y no descuenta
            inventario.
          </p>
        </section>
      )}
    </main>
  );
}
