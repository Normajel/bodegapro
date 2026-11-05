import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "./database.types";
import { loadMyCompanies } from "./company-api";
import { tenantQueryKeys } from "./tenant-catalog";
import type { PreparedNewOrder } from "./new-order";

/** Release gate: keep creation disabled until real-user authorization is tested. */
export const PURCHASE_CREATION_WRITES_ENABLED = false;

const db = supabase as unknown as SupabaseClient<Database>;

/** Shared transaction service, staged for later authorized activation. */
export async function submitTenantNewOrder(
  draft: PreparedNewOrder,
  orderId: string,
  queryClient: QueryClient,
): Promise<string> {
  if (!PURCHASE_CREATION_WRITES_ENABLED) {
    throw new Error("Crear OC permanece deshabilitado hasta validar sesiones Auth reales.");
  }
  if (!orderId || !draft.companyId) throw new Error("Falta la empresa o identificador de OC.");
  const memberships = await loadMyCompanies();
  const role = memberships.find(({ company }) => company.id === draft.companyId)?.role;
  if (role !== "ADMIN" && role !== "ADMINPRO") {
    throw new Error("Solo Administración puede crear órdenes de compra.");
  }
  const { data, error } = await db.rpc("create_tenant_purchase_order", {
    p_company_id: draft.companyId,
    p_order_id: orderId,
    p_order_kind: draft.kind,
    p_supplier_id: draft.supplierId,
    p_order_number: draft.orderNumber,
    p_payment_terms: draft.paymentTerms,
    p_notes: draft.notes,
    p_items: draft.items,
  });
  if (error) throw error;
  if (!data) throw new Error("No se recibió confirmación de creación.");
  await queryClient.invalidateQueries({ queryKey: tenantQueryKeys.orders(draft.companyId) });
  return data;
}
