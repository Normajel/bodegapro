import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "./database.types";
import type { CompanyRole } from "./tenant";
import { loadMyCompanies } from "./company-api";
import { tenantQueryKeys } from "./tenant-catalog";

/** Remains off until independent, real-user Auth tests have passed. */
export const PURCHASE_APPROVAL_WRITES_ENABLED = false;

export function canApproveTenantOrder(role: CompanyRole | null | undefined): boolean {
  return role === "ADMIN" || role === "ADMINPRO" || role === "GERENCIA" || role === "GERENTE";
}

const db = supabase as unknown as SupabaseClient<Database>;

export async function approveTenantOrder(
  companyId: string,
  orderId: string,
  queryClient: QueryClient,
): Promise<string> {
  if (!PURCHASE_APPROVAL_WRITES_ENABLED) {
    throw new Error("La aprobación está deshabilitada hasta validar las sesiones Auth reales.");
  }
  if (!companyId || !orderId) throw new Error("Falta empresa u orden de compra.");

  const companies = await loadMyCompanies();
  const membership = companies.find(({ company }) => company.id === companyId);
  if (!canApproveTenantOrder(membership?.role)) {
    throw new Error("Solo Gerencia o Administración pueden aprobar esta orden.");
  }

  // Authorization is enforced AGAIN by the SQL RPC. UI checks are not a security boundary.
  const { data, error } = await db.rpc("approve_tenant_purchase_order", {
    p_company_id: companyId,
    p_order_id: orderId,
  });
  if (error) throw error;
  if (!data) throw new Error("No se confirmó la aprobación de la orden.");

  await queryClient.invalidateQueries({ queryKey: tenantQueryKeys.orders(companyId) });
  await queryClient.invalidateQueries({ queryKey: tenantQueryKeys.receiptLines(companyId, orderId) });
  return data;
}
