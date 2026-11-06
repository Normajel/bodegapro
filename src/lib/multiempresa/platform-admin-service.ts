import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { loadMyCompanies } from "./company-api";

type AdminCompanyUser = { user_id: string; email: string; role_code: string; status: string };
const db = supabase as unknown as SupabaseClient;
export async function listAdminProCompanyUsers(companyId: string): Promise<AdminCompanyUser[]> {
  if (!companyId) throw new Error("Selecciona una empresa.");
  const membership = (await loadMyCompanies()).find((entry) => entry.company.id === companyId);
  if (membership?.role !== "ADMINPRO") throw new Error("No tienes acceso AdminPro a esta empresa.");
  const { data, error } = await db.rpc("adminpro_company_users", { p_company_id: companyId });
  if (error) throw error;
  return (data ?? []) as AdminCompanyUser[];
}
export function useAdminProCompanyUsers(companyId: string | null) {
  return useQuery({
    queryKey: ["platform", "company-users", companyId ?? ""],
    queryFn: () => listAdminProCompanyUsers(companyId!),
    enabled: !!companyId,
    staleTime: 0,
  });
}

export type AdminCompanyBilling = {
  company_id: string;
  company_name: string;
  plan_name: string | null;
  subscription_status: string | null;
  amount_clp: number | null;
  billing_interval: string | null;
  period_end: string | null;
  invoice_count: number;
  confirmed_payment_clp: number;
};

export async function loadAdminProCompanyBilling(companyId: string): Promise<AdminCompanyBilling | null> {
  const membership = (await loadMyCompanies()).find(({ company }) => company.id === companyId);
  if (membership?.role !== "ADMINPRO") throw new Error("No tienes acceso a los datos de facturación de esta empresa.");
  const { data, error } = await db.rpc("adminpro_company_billing", { p_company_id: companyId });
  if (error) throw error;
  return (data?.[0] ?? null) as AdminCompanyBilling | null;
}

const editableRoles = ["ADMIN", "GERENCIA", "GERENTE", "BODEGA", "VENTAS", "JEFE_PRODUCCION"] as const;
export type EditableCompanyRole = (typeof editableRoles)[number];

export async function updateAdminProCompanyMemberRole(
  companyId: string, userId: string, role: EditableCompanyRole
): Promise<void> {
  const membership = (await loadMyCompanies()).find(({ company }) => company.id === companyId);
  if (membership?.role !== "ADMINPRO") throw new Error("Solo AdminPro puede modificar perfiles de esta empresa.");
  if (!editableRoles.includes(role)) throw new Error("Perfil no válido.");
  const { error } = await db.rpc("adminpro_update_company_member_role", {
    p_company_id: companyId, p_user_id: userId, p_role_code: role,
  });
  if (error) throw error;
}
