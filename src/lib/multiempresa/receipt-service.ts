import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "./database.types";
import { loadMyCompanies } from "./company-api";
import { tenantQueryKeys } from "./tenant-catalog";
import type { ReceiptBatchPayload } from "./receipt-batch";

/** Release gate: real Auth browser tests must pass before changing this flag. */
export const RECEIPT_WRITES_ENABLED = false;

const db = supabase as unknown as SupabaseClient<Database>;

/**
 * One shared write entry point for Órdenes de compra and Movimientos.
 * Caller supplies the same operation key for retries after network failure.
 * Never bypass the backend's own role, tenant, stock and idempotency checks.
 */
export async function submitTenantReceiptBatch(
  payload: ReceiptBatchPayload,
  operationKey: string,
  queryClient: QueryClient,
): Promise<string> {
  if (!RECEIPT_WRITES_ENABLED) {
    throw new Error("La recepción permanece deshabilitada hasta validar usuarios Auth reales.");
  }
  if (!operationKey) throw new Error("Falta el identificador único de la recepción.");
  const allowed = await loadMyCompanies();
  const membership = allowed.find((entry) => entry.company.id === payload.p_company_id);
  if (!membership || !["BODEGA", "ADMIN", "ADMINPRO"].includes(membership.role)) {
    throw new Error("El perfil no está autorizado a recepcionar para esta empresa.");
  }
  const { data, error } = await db.rpc("receive_tenant_purchase_order_batch", {
    ...payload,
    p_operation_key: operationKey,
  });
  if (error) throw error;
  if (!data) throw new Error("Supabase no devolvió el identificador de recepción.");

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: tenantQueryKeys.orders(payload.p_company_id) }),
    queryClient.invalidateQueries({ queryKey: tenantQueryKeys.movements(payload.p_company_id) }),
    queryClient.invalidateQueries({ queryKey: tenantQueryKeys.products(payload.p_company_id) }),
    queryClient.invalidateQueries({
      queryKey: tenantQueryKeys.receiptLines(payload.p_company_id, payload.p_order_id),
    }),
    queryClient.invalidateQueries({
      queryKey: tenantQueryKeys.orderReceipts(payload.p_company_id, payload.p_order_id),
    }),
  ]);
  return data;
}
