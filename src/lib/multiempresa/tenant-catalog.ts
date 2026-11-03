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
  movements: (companyId: string) => ["tenant", companyId, "movements"] as const,
  receiptLines: (companyId: string, orderId: string) => ["tenant", companyId, "receipt-lines", orderId] as const,
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

export async function listCompanyMovements(companyId: string) {
  await requireCompany(companyId);
  const { data, error } = await db
    .from("stock_movements")
    .select("id,company_id,folio,product_id,type,quantity,measure_unit,reference,document_type,document_number,created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}

export async function listCompanyReceiptLines(companyId: string, orderId: string) {
  await requireCompany(companyId);
  if (!orderId) throw new Error("Selecciona una orden de compra.");
  const { data, error } = await db
    .from("purchase_order_items")
    .select("id,company_id,purchase_order_id,product_id,item_type,description,quantity,received_quantity")
    .eq("company_id", companyId)
    .eq("purchase_order_id", orderId)
    .order("description");
  if (error) throw error;
  return data.map(line => ({
    purchase_order_item_id: line.id,
    company_id: line.company_id,
    purchase_order_id: line.purchase_order_id,
    product_id: line.product_id,
    item_type: line.item_type,
    description: line.description,
    ordered_quantity: line.quantity,
    received_quantity: line.received_quantity,
    pending_quantity: Math.max(0, Number(line.quantity) - Number(line.received_quantity)),
  }));
}
