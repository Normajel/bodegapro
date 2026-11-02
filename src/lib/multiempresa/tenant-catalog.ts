import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "./database.types";
import { loadMyCompanies } from "./company-api";

const db = supabase as unknown as SupabaseClient<Database>;

async function requireCompany(companyId: string) {
  if (!companyId) throw new Error("Debes seleccionar una empresa.");
  const memberships = await loadMyCompanies();
  if (!memberships.some(({ company }) => company.id === companyId)) {
    throw new Error("No tienes acceso a la empresa seleccionada.");
  }
}

export const tenantQueryKeys = {
  products: (companyId: string) => ["tenant", companyId, "products"] as const,
  suppliers: (companyId: string) => ["tenant", companyId, "suppliers"] as const,
  orders: (companyId: string) => ["tenant", companyId, "purchase-orders"] as const,
};

export async function listCompanyProducts(companyId: string) {
  await requireCompany(companyId);
  const { data, error } = await db
    .from("products")
    .select("id,company_id,sku,name,category,unit,stock,stock_quantity,min_stock,unit_cost,active")
    .eq("company_id", companyId)
    .order("name");
  if (error) throw error;
  return data;
}

export async function listCompanySuppliers(companyId: string) {
  await requireCompany(companyId);
  const { data, error } = await db
    .from("suppliers")
    .select("id,company_id,name,supplier_kind,delivery_days,email,phone")
    .eq("company_id", companyId)
    .order("name");
  if (error) throw error;
  return data;
}

export async function listCompanyPurchaseOrders(companyId: string) {
  await requireCompany(companyId);
  const { data, error } = await db
    .from("purchase_orders")
    .select("id,company_id,order_number,approval_status,status,order_date,total_amount")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
