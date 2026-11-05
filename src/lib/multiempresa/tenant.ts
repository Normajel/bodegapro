/**
 * INTEGRASTOCK multiempresa: company selection primitives.
 *
 * IMPORTANT: This module is client-side state only. Never authorize access
 * based on the selected company, localStorage, or a client-supplied companyId.
 * Database RLS and tenant-scoped RPCs must enforce actual membership.
 */

export type CompanyRole =
  "ADMIN" | "ADMINPRO" | "GERENCIA" | "GERENTE" | "BODEGA" | "VENTAS" | "JEFE_PRODUCCION";

export interface CompanyMembership {
  company_id: string;
  user_id: string;
  role_code: CompanyRole;
  status: "active" | "inactive";
}

export interface CompanySummary {
  id: string;
  name: string;
  status: "active" | "suspended";
}

export interface CompanyOption {
  company: CompanySummary;
  role: CompanyRole;
}

export function eligibleCompanies(
  userId: string,
  companies: readonly CompanySummary[],
  memberships: readonly CompanyMembership[],
): CompanyOption[] {
  const eligible = new Map<string, CompanyRole>();
  for (const membership of memberships) {
    if (membership.user_id === userId && membership.status === "active") {
      eligible.set(membership.company_id, membership.role_code);
    }
  }
  return companies.flatMap((company) => {
    const role = eligible.get(company.id);
    return company.status === "active" && role ? [{ company, role }] : [];
  });
}

/**
 * Previously selected company is used only if the user currently belongs
 * to it. Otherwise choose the sole allowed company, or require selection.
 */
export function resolveActiveCompany(
  options: readonly CompanyOption[],
  requestedCompanyId: string | null | undefined,
): CompanyOption | null {
  if (requestedCompanyId) {
    const match = options.find(({ company }) => company.id === requestedCompanyId);
    if (match) return match;
  }
  return options.length === 1 ? (options[0] ?? null) : null;
}

/** Call on sign-out and whenever authentication user changes. */
export function clearCompanySelection(): null {
  return null;
}
