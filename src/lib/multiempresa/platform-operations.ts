import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { loadMyCompanies } from "./company-api";

const db = supabase as unknown as SupabaseClient;
export type PlatformOverview = {
  companies: Array<{ id: string; name: string; status: string; tax_id: string | null }>;
  plans: Array<{
    id: string;
    code: string;
    name: string;
    price_clp: number;
    billing_interval: string;
    max_users: number;
    active: boolean;
  }>;
  subscriptions: Array<{
    id: string;
    company_id: string;
    plan_id: string;
    status: string;
    current_period_end: string | null;
  }>;
  invoices: Array<{
    id: string;
    company_id: string;
    invoice_number: string;
    amount_clp: number;
    status: string;
    due_at: string;
  }>;
  payments: Array<{
    id: string;
    invoice_id: string;
    amount_clp: number;
    method: string;
    status: string;
    payment_reference: string;
    paid_at: string;
  }>;
};
export async function getPlatformOverview(): Promise<PlatformOverview> {
  const { data, error } = await db.rpc("platform_admin_overview");
  if (error) throw error;
  return data as PlatformOverview;
}
async function execute(name: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data as string;
}
export const platformCreateCompany = (name: string, taxId: string) =>
  execute("platform_create_company", { p_name: name, p_tax_id: taxId || null });
export const platformCreatePlan = (
  code: string,
  name: string,
  price: number,
  interval: "monthly" | "annual",
  maxUsers: number,
) =>
  execute("platform_create_plan", {
    p_code: code,
    p_name: name,
    p_price_clp: price,
    p_interval: interval,
    p_max_users: maxUsers,
  });
export const platformActivatePlan = (
  companyId: string,
  planId: string,
  status: "trial" | "active",
  periodEnd: string,
) =>
  execute("platform_set_subscription", {
    p_company_id: companyId,
    p_plan_id: planId,
    p_status: status,
    p_period_end: periodEnd,
  });
export const platformCreateInvoice = (
  companyId: string,
  number: string,
  dueAt: string,
  amount: number,
) =>
  execute("platform_create_invoice", {
    p_company_id: companyId,
    p_number: number,
    p_due_at: dueAt,
    p_amount_clp: amount,
  });
export const platformRecordPayment = (
  invoiceId: string,
  amount: number,
  method: "transfer" | "card" | "cash" | "other",
  reference: string,
) =>
  execute("platform_record_payment", {
    p_invoice_id: invoiceId,
    p_amount_clp: amount,
    p_method: method,
    p_reference: reference,
  });
export const platformConfirmPayment = (paymentId: string) =>
  execute("platform_confirm_payment", { p_payment_id: paymentId });
export async function platformInviteUser(
  companyId: string,
  email: string,
  role: string,
): Promise<string> {
  const { data, error } = await db.functions.invoke("platform-invite", {
    body: { companyId, email, role },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.message || "No se pudo enviar la invitación.");
  return data.message as string;
}
export async function isPlatformOwner(): Promise<boolean> {
  const { data, error } = await db.rpc("platform_is_admin");
  if (error) throw error;
  return data === true;
}

export type PlatformInvitation = {
  company_id: string;
  company_name: string;
  email: string;
  role_code: string;
  status: string;
  created_at: string;
};
export async function platformListInvitations(): Promise<PlatformInvitation[]> {
  const { data, error } = await db.rpc("platform_list_invitations");
  if (error) throw error;
  return (data ?? []) as PlatformInvitation[];
}
