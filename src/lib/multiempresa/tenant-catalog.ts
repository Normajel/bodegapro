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
  inventoryAdjustments: (companyId: string) =>
    ["tenant", companyId, "inventory-adjustments"] as const,
  suppliers: (companyId: string) => ["tenant", companyId, "suppliers"] as const,
  orders: (companyId: string) => ["tenant", companyId, "purchase-orders"] as const,
  movements: (companyId: string) => ["tenant", companyId, "movements"] as const,
  managementMovements: (companyId: string, from: string, to: string) =>
    ["tenant", companyId, "management-movements", from, to] as const,
  movementCancellations: (companyId: string) =>
    ["tenant", companyId, "movement-cancellations"] as const,
  acceptedServices: (companyId: string) => ["tenant", companyId, "accepted-services"] as const,
  receiptLines: (companyId: string, orderId: string) =>
    ["tenant", companyId, "receipt-lines", orderId] as const,
  orderReceipts: (companyId: string, orderId: string) =>
    ["tenant", companyId, "order-receipts", orderId] as const,
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
    .select(
      "id,company_id,order_number,order_kind,approval_status,approved_at,approved_by,status,order_date,total_amount",
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listCompanyMovements(companyId: string) {
  await requireCompany(companyId);
  const { data, error } = await db
    .from("stock_movements")
    .select(
      "id,company_id,folio,product_id,purchase_order_id,purchase_order_item_id,type,quantity,measure_unit,reference,document_type,document_number,created_at",
    )
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
    .select(
      "id,company_id,purchase_order_id,product_id,item_type,description,quantity,received_quantity",
    )
    .eq("company_id", companyId)
    .eq("purchase_order_id", orderId)
    .order("description");
  if (error) throw error;
  return data.map((line) => ({
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

/** Only recorded OC receipts appear here; unlinked adjustments are excluded. */
export async function listCompanyOrderReceipts(companyId: string, orderId: string) {
  await requireCompany(companyId);
  if (!orderId) throw new Error("Selecciona una orden de compra.");
  const { data, error } = await db
    .from("stock_movements")
    .select(
      "id,company_id,folio,purchase_order_id,purchase_order_item_id,product_id,type,quantity,reference,document_type,document_number,created_at",
    )
    .eq("company_id", companyId)
    .eq("purchase_order_id", orderId)
    .eq("type", "entrada")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** Company-scoped service acceptance ledger. No stock movements are involved. */
export async function listCompanyAcceptedServices(companyId: string) {
  await requireCompany(companyId);
  const { data, error } = await db
    .from("accepted_services")
    .select(
      "id,company_id,purchase_order_id,purchase_order_item_id,supplier_id,supplier_name,order_number,description,entered_at,approved_at,payment_terms,quantity,measure_unit,net_total,total,status",
    )
    .eq("company_id", companyId)
    .order("approved_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** Read-only audit trail, restricted again by server-side RLS to company admins. */
export async function listCompanyInventoryAdjustments(companyId: string) {
  await requireCompany(companyId);
  const { data, error } = await db
    .from("tenant_inventory_adjustments")
    .select(
      "id,company_id,product_id,description,category,initial_stock,adjusted_stock,reason,created_at,created_by,edited_at",
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}

/**
 * Only users with active membership may view cancellation explanations.
 * The cancellation itself remains a staged SQL RPC inaccessible from the web.
 */
export async function listCompanyMovementCancellations(companyId: string) {
  await requireCompany(companyId);
  const { data, error } = await db
    .from("tenant_movement_cancellations")
    .select(
      "id,company_id,movement_id,product_id,original_type,quantity,reason,cancelled_by,cancelled_at",
    )
    .eq("company_id", companyId)
    .order("cancelled_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}

/**
 * Dashboard retrieves complete dated movement data, not the 100-row preview.
 * On very large datasets it fails clearly instead of silently showing partial totals.
 * Cancelled standalone movements are excluded using the tenant audit ledger.
 */
export async function listTenantManagementMovements(companyId: string, from: string, to: string) {
  await requireCompany(companyId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw new Error("Selecciona un período válido.");
  }
  const rows: Array<{ id: string; type: string; quantity: number; created_at: string }> = [];
  const cancelled = new Set<string>();
  for (let start = 0; start <= 5000; start += 1000) {
    const { data, error } = await db
      .from("stock_movements")
      .select("id,type,quantity,created_at")
      .eq("company_id", companyId)
      .gte("created_at", from + "T00:00:00-03:00")
      .lt("created_at", to + "T23:59:59.999-03:00")
      .order("id")
      .range(start, start + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
    if (start === 5000) throw new Error("El período supera el máximo de registros del panel; acota las fechas.");
  }
  for (let start = 0; start <= 5000; start += 1000) {
    const { data, error } = await db
      .from("tenant_movement_cancellations")
      .select("movement_id")
      .eq("company_id", companyId)
      .order("id")
      .range(start, start + 999);
    if (error) throw error;
    for (const entry of data ?? []) cancelled.add(entry.movement_id);
    if ((data?.length ?? 0) < 1000) break;
    if (start === 5000) throw new Error("El historial de anulaciones supera el máximo permitido.");
  }
  return rows.filter((movement) => !cancelled.has(movement.id));
}
