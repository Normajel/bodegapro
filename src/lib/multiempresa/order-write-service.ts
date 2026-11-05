import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "./database.types";
import { loadMyCompanies } from "./company-api";
import type { PreparedNewOrder } from "./new-order";

const db = supabase as unknown as SupabaseClient<Database>;

export async function createCompanyPurchaseOrder(prepared: PreparedNewOrder): Promise<string> {
  const { companyId, kind, supplierId, orderNumber, paymentTerms, notes, items } = prepared;
  const membership = (await loadMyCompanies()).find(({ company }) => company.id === companyId);
  if (!membership || !["ADMIN", "ADMINPRO"].includes(membership.role)) {
    throw new Error("Solo Administración o AdminPro pueden crear órdenes de compra.");
  }
  if (!companyId || !supplierId || !orderNumber || !items.length) {
    throw new Error("Faltan datos para registrar la orden.");
  }
  const orderId = crypto.randomUUID();
  // The DB function independently validates company membership, supplier,
  // products, line totals and uniqueness, and creates the order atomically.
  const { data, error } = await db.rpc("create_tenant_purchase_order", {
    p_company_id: companyId,
    p_order_id: orderId,
    p_order_kind: kind,
    p_supplier_id: supplierId,
    p_order_number: orderNumber,
    p_payment_terms: paymentTerms,
    p_notes: notes,
    p_items: items,
  });
  if (error) throw error;
  if (data !== orderId) throw new Error("No se confirmó el registro de la OC.");
  return orderId;
}
