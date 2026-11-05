import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/lib/multiempresa/database.types";
import { useActiveCompany } from "@/lib/multiempresa/company-context";
import { listCompanyProducts, tenantQueryKeys } from "@/lib/multiempresa/tenant-catalog";

const db = supabase as unknown as SupabaseClient<Database>;

/**
 * Saved cubication documents are independent of the permission to edit/create
 * cubications. Every query is constrained by company and enforced by RLS.
 */
export function TenantCubicationDocumentsPreview() {
  const companyId = useActiveCompany();
  const [selection, setSelection] = useState("");
  const catalog = useQuery({
    queryKey: ["tenant", companyId ?? "", "saved-cubication-documents"],
    enabled: !!companyId,
    queryFn: async () => {
      const [normal, special] = await Promise.all([
        db.from("cubication_templates").select("id,company_id,unit_code,created_at")
          .eq("company_id", companyId!).order("created_at", { ascending: false }),
        db.from("special_cubication_documents").select("id,company_id,unit_code,created_at")
          .eq("company_id", companyId!).order("created_at", { ascending: false }),
      ]);
      if (normal.error) throw normal.error;
      if (special.error) throw special.error;
      return [
        ...(normal.data ?? []).map((item) => ({ ...item, kind: "normal" as const })),
        ...(special.data ?? []).map((item) => ({ ...item, kind: "especial" as const })),
      ];
    },
  });
  const selected = catalog.data?.find((item) => `${item.kind}:${item.id}` === selection);
  const details = useQuery({
    queryKey: ["tenant", companyId ?? "", "saved-cubication-lines", selection],
    enabled: !!companyId && !!selected,
    queryFn: async () => {
      if (!selected) return [];
      if (selected.kind === "normal") {
        const { data, error } = await db.from("cubication_template_items")
          .select("product_id,quantity")
          .eq("company_id", companyId!)
          .eq("template_id", selected.id);
        if (error) throw error;
        return (data ?? []).map((line) => ({
          productId: line.product_id, quantity: Number(line.quantity),
          cost: null as number | null,
        }));
      }
      const { data, error } = await db.from("special_cubication_lines")
        .select("special_product_id,quantity,total_cost")
        .eq("company_id", companyId!).eq("document_id", selected.id);
      if (error) throw error;
      return (data ?? []).map((line) => ({
        productId: line.special_product_id, quantity: Number(line.quantity),
        cost: Number(line.total_cost),
      }));
    },
  });
  const products = useQuery({
    queryKey: tenantQueryKeys.products(companyId ?? ""),
    queryFn: () => listCompanyProducts(companyId!),
    enabled: !!companyId,
  });
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-bold">Documentos de cubicación guardados</h1>
      <p className="mt-2 text-sm text-slate-600">
        Consulta de las unidades guardadas de la empresa. Puedes ver estos documentos
        aunque no tengas autorización para crear o editar cubicaciones.
      </p>
      {!companyId && <p role="status" className="mt-4">Selecciona una empresa.</p>}
      {companyId && catalog.isPending && <p role="status" className="mt-4">Cargando documentos…</p>}
      {companyId && catalog.isError && <p role="alert" className="mt-4">No se pudieron consultar los documentos.</p>}
      {companyId && catalog.isSuccess && (
        <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
          <label htmlFor="saved-cubication-document" className="block text-sm font-semibold">Unidad de cubicaje guardada</label>
          <select
            id="saved-cubication-document"
            value={selection}
            onChange={(event) => setSelection(event.target.value)}
            className="mt-2 w-full rounded border border-slate-300 bg-white p-2"
          >
            <option value="">Selecciona una unidad</option>
            {catalog.data.map((document) => (
              <option key={`${document.kind}:${document.id}`} value={`${document.kind}:${document.id}`}>
                {document.unit_code} · {document.kind === "especial" ? "Cubicación especial" : "Cubicación normal"}
              </option>
            ))}
          </select>
          {catalog.data.length === 0 && (
            <p className="mt-3 text-sm text-slate-600">No hay unidades de cubicación guardadas en esta empresa.</p>
          )}
          {selected && (
            <div className="mt-4">
              <h2 className="font-semibold">Unidad: {selected.unit_code}</h2>
              <p className="text-xs text-slate-600">
                Guardada: {new Date(selected.created_at).toLocaleDateString("es-CL")}
              </p>
              {details.isPending && <p role="status">Cargando detalle…</p>}
              {details.isError && <p role="alert">No se pudo cargar el detalle de esta unidad.</p>}
              {details.isSuccess && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50">
                      <tr><th className="p-2">Producto</th><th className="p-2">Cantidad</th><th className="p-2">Costo total especial</th></tr>
                    </thead>
                    <tbody>
                      {details.data.map((line) => (
                        <tr key={line.productId} className="border-t">
                          <td className="p-2">{products.data?.find((product) => product.id === line.productId)?.name ?? "Producto registrado"}</td>
                          <td className="p-2">{line.quantity}</td>
                          <td className="p-2">{line.cost === null ? "—" : line.cost.toLocaleString("es-CL")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {details.data.length === 0 && <p className="p-3 text-sm text-slate-600">Esta unidad no tiene líneas registradas.</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
