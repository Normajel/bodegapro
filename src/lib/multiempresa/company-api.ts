import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "./database.types";
import {
  eligibleCompanies,
  resolveActiveCompany,
  type CompanyOption,
  type CompanyMembership,
  type CompanySummary,
} from "./tenant";

/**
 * Transitional typed API for the NEW Supabase schema only.
 * The legacy generated types are not replaced yet because the old routes
 * reference tables and RPCs that haven't been migrated.
 */
const db = supabase as unknown as SupabaseClient<Database>;

export async function loadMyCompanies(): Promise<CompanyOption[]> {
  // Use an authenticated user confirmed by Supabase, not an untrusted user id.
  const { data: userData, error: authError } = await db.auth.getUser();
  if (authError) throw authError;
  if (!userData.user) return [];

  // Both reads are protected by Supabase RLS. Never add service-role access.
  const { data: memberships, error: membershipError } = await db
    .from("company_memberships")
    .select("company_id,user_id,role_code,status")
    .eq("user_id", userData.user.id)
    .eq("status", "active");
  if (membershipError) throw membershipError;
  if (!memberships?.length) return [];

  const companyIds = memberships.map((m) => m.company_id);
  const { data: companies, error: companyError } = await db
    .from("companies")
    .select("id,name,status")
    .in("id", companyIds)
    .eq("status", "active");
  if (companyError) throw companyError;

  return eligibleCompanies(
    userData.user.id,
    (companies ?? []) as CompanySummary[],
    memberships as CompanyMembership[],
  );
}

export async function loadSelectedCompany(
  requestedCompanyId?: string | null,
): Promise<CompanyOption | null> {
  const allowed = await loadMyCompanies();
  return resolveActiveCompany(allowed, requestedCompanyId);
}
