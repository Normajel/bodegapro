import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "./database.types";
import { loadMyCompanies } from "./company-api";
import { tenantQueryKeys } from "./tenant-catalog";
import {
  prepareTenantSalesNote,
  SALES_NOTE_WRITES_ENABLED,
  type SalesNoteDraft,
} from "./sales-note-draft";

const db = supabase as unknown as SupabaseClient<Database>;

/**
 * Staged atomic NV creation. Activation requires real Auth/RLS browser tests.
 * The SQL function independently validates company, role, customer and cubicaciones.
 */
export async function registerTenantSalesNote(
  draft: SalesNoteDraft,
  noteId: string,
  queryClient: QueryClient,
): Promise<string> {
  if (!SALES_NOTE_WRITES_ENABLED) {
    throw new Error("El registro de NV está deshabilitado hasta validar cuentas Auth reales.");
  }
  const prepared = prepareTenantSalesNote(draft);
  if (!noteId) throw new Error("Falta identificador de la NV.");
  const memberships = await loadMyCompanies();
  const role = memberships.find(({ company }) => company.id === prepared.companyId)?.role;
  if (!["ADMIN", "ADMINPRO", "VENTAS", "VENTA"].includes(role ?? "")) {
    throw new Error("El perfil no tiene autorización para crear NV en esta empresa.");
  }
  const { data, error } = await db.rpc("create_tenant_sales_note", {
    p_company_id: prepared.companyId,
    p_note_id: noteId,
    p_number: prepared.number,
    p_customer_id: prepared.customerId,
    p_notes: prepared.notes,
    p_units: prepared.units,
  });
  if (error) throw error;
  if (!data) throw new Error("No se recibió confirmación de registro.");
  await queryClient.invalidateQueries({ queryKey: tenantQueryKeys.salesNotes(prepared.companyId) });
  return data;
}
