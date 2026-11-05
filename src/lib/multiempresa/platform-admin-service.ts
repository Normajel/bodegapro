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
