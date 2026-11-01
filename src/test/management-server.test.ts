import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  role: "BODEGA",
  aal: "aal1",
  reads: [] as string[],
  allow: true,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware() {
      return this;
    },
    validator() {
      return this;
    },
    handler(fn: unknown) {
      return fn;
    },
  }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import { getManagementData } from "@/lib/management.functions";
const invoke = () => {
  const db = {
    from(table: string) {
      fixture.reads.push(table);
      const chain = {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        single: async () => ({
          data: { app_roles: { name: fixture.role, permissions: {} } },
          error: null,
        }),
        gte() {
          return this;
        },
        lt() {
          return this;
        },
        lte() {
          return this;
        },
        order() {
          return this;
        },
        range: async () => ({ data: [], error: null }),
      };
      return chain;
    },
    rpc: async () => ({ data: fixture.allow, error: null }),
  };
  return (getManagementData as unknown as (args: unknown) => Promise<unknown>)({
    data: { from: "2026-11-01", to: "2026-11-01" },
    context: { supabase: db, userId: "user", claims: { aal: fixture.aal } },
  });
};
beforeEach(() => {
  fixture.reads = [];
  fixture.allow = true;
  fixture.aal = "aal1";
});
describe("management server authorization", () => {
  it("rejects a direct Bodega request before reading business tables", async () => {
    fixture.role = "BODEGA";
    await expect(invoke()).rejects.toThrow("Acceso exclusivo");
    expect(fixture.reads).toEqual(["profiles"]);
  });
  it("requires MFA for Admin even for a direct request", async () => {
    fixture.role = "ADMIN";
    await expect(invoke()).rejects.toThrow("segundo factor");
    expect(fixture.reads).toEqual(["profiles"]);
  });
  it("denies partial RLS access rather than showing a misleading zero", async () => {
    fixture.role = "GERENCIA";
    fixture.allow = false;
    await expect(invoke()).rejects.toThrow("Falta permiso");
    expect(fixture.reads).toEqual(["profiles"]);
  });
  it("allows Gerencia through the protected read endpoint", async () => {
    fixture.role = "GERENCIA";
    await expect(invoke()).resolves.toMatchObject({ products: [], templates: [], items: [] });
    expect(fixture.reads).toContain("cubication_template_items");
  });
});
