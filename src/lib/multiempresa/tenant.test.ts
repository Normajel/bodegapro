import { describe, expect, it } from "vitest";
import { eligibleCompanies, resolveActiveCompany } from "./tenant";

const companies = [
  { id: "company-a", name: "Empresa A", status: "active" as const },
  { id: "company-b", name: "Empresa B", status: "active" as const },
  { id: "company-c", name: "Empresa C", status: "suspended" as const },
];
const memberships = [
  {
    company_id: "company-a",
    user_id: "user-1",
    role_code: "ADMIN" as const,
    status: "active" as const,
  },
  {
    company_id: "company-b",
    user_id: "user-2",
    role_code: "BODEGA" as const,
    status: "active" as const,
  },
  {
    company_id: "company-c",
    user_id: "user-1",
    role_code: "VENTAS" as const,
    status: "active" as const,
  },
];

describe("multiempresa active company selection", () => {
  it("shows only active companies linked to the authenticated user", () => {
    expect(eligibleCompanies("user-1", companies, memberships).map((x) => x.company.id)).toEqual([
      "company-a",
    ]);
  });

  it("rejects a requested company without a current membership", () => {
    const options = eligibleCompanies("user-1", companies, memberships);
    expect(resolveActiveCompany(options, "company-b")?.company.id).toBe("company-a");
  });

  it("requires explicit selection when the user has multiple active companies", () => {
    const options = eligibleCompanies("user-1", companies, [
      ...memberships,
      {
        company_id: "company-b",
        user_id: "user-1",
        role_code: "ADMIN" as const,
        status: "active" as const,
      },
    ]);
    expect(resolveActiveCompany(options, null)).toBeNull();
    expect(resolveActiveCompany(options, "company-b")?.company.id).toBe("company-b");
  });
});
