import type { Tables } from "@/integrations/supabase/types";
export type SpecialProduct = Tables<"special_products">;
export function canAccessSpecialProducts(role?: string | null) {
  return ["ADMIN", "ADMINPRO", "VENTA", "VENTAS"].includes(role?.trim().toUpperCase() ?? "");
}
export type SpecialPurchase = {
  id: string;
  purchase_date: string;
  received_at?: string;
  supplier_name: string;
  order_number: string;
  quantity: number;
  received_quantity?: number;
  unit_cost: number;
  total_cost: number;
  status: string;
  approval_status?: string;
  document_number?: string;
};
export type SpecialUsage = {
  id: string;
  unit_code: string;
  created_at: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  context: { client?: string; salesOrderNumber?: string };
};
export type SpecialHistory = {
  purchases: SpecialPurchase[];
  orders: SpecialPurchase[];
  usage: SpecialUsage[];
};

// Compatibilidad con OC anteriores que incluyeron el código dentro de la descripción.
// El SKU continúa almacenado por separado en el catálogo para trazabilidad.
export function specialProductDescription(description: string) {
  return description.replace(/^ESP\d{6}\s*[·-]\s*/i, "");
}
