import { useEffect, useState, type ReactNode } from "react";
import { useLocation, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/lib/multiempresa/company-context";
import { loadMyCompanies } from "@/lib/multiempresa/company-api";
import { supabase } from "@/integrations/supabase/client";
import { TenantInventoryPreview } from "./TenantInventoryPreview";
import { TenantSuppliersPreview } from "./TenantSuppliersPreview";
import { TenantOrdersPreview } from "./TenantOrdersPreview";
import { TenantMovementsPreview } from "./TenantMovementsPreview";
import { PlatformAdminDashboard } from "./PlatformAdminDashboard";
import { TenantCompanyDashboard } from "./TenantCompanyDashboard";

/**
 * Fail-closed migration gate: old authenticated routes contain unscoped
 * queries and must NOT render against the new multiempresa backend yet.
 * Replace this gate with tenant-aware per-route loaders only after audit.
 */
export function LegacyMigrationGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [auth, setAuth] = useState<"checking" | "signed-in" | "signed-out">("checking");
  const companyId = useActiveCompany();
  const erpPaths = new Set([
    "/dashboard",
    "/productos",
    "/contactos",
    "/compras",
    "/movimientos",
    "/documento-cubicacion",
    "/panel-gerencial",
    "/notas-venta",
  ]);
  const needsSubscription = auth === "signed-in" && erpPaths.has(pathname) && !!companyId;
  const subscription = useQuery({
    queryKey: ["tenant", companyId ?? "", "subscription-access"],
    queryFn: async () => {
      const companies = await loadMyCompanies();
      if (!companies.some(({ company }) => company.id === companyId))
        throw new Error("No tienes acceso a esta empresa.");
      const { data, error } = await supabase.rpc("tenant_subscription_valid", {
        p_company_id: companyId!,
      });
      if (error) throw error;
      return data === true;
    },
    enabled: needsSubscription,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    let alive = true;
    void supabase.auth
      .getUser()
      .then(({ data }) => {
        if (alive) setAuth(data.user ? "signed-in" : "signed-out");
      })
      .catch(() => {
        if (alive) setAuth("signed-out");
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!alive) return;
      if (event === "SIGNED_IN") setAuth("signed-in");
      if (event === "SIGNED_OUT") setAuth("signed-out");
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  if (auth === "checking") return <p className="p-6 text-sm">Verificando sesión…</p>;
  if (auth === "signed-out") return <>{children}</>;

  // Client-side clarity only; RLS and SQL write guards enforce security.
  if (needsSubscription && subscription.isPending)
    return (
      <p role="status" className="p-6">
        Verificando suscripción de la empresa…
      </p>
    );
  if (needsSubscription && subscription.isError)
    return (
      <main role="alert" className="mx-auto max-w-2xl p-8">
        <h1 className="text-xl font-bold">No se pudo verificar la suscripción</h1>
        <p className="mt-2 text-sm">
          El ERP permanece bloqueado hasta confirmar el acceso. Solicita revisión a Administración.
        </p>
        <Link className="mt-4 inline-block text-teal-700 underline" to="/adminpro">
          Administración central
        </Link>
      </main>
    );
  if (needsSubscription && subscription.isSuccess && !subscription.data)
    return (
      <main role="status" className="mx-auto max-w-2xl p-8">
        <h1 className="text-xl font-bold">ERP temporalmente bloqueado</h1>
        <p className="mt-3 text-sm">
          La empresa no tiene una suscripción activa y vigente. Inventario, órdenes, movimientos y
          documentos permanecen protegidos. Contacta a Administración para revisar el plan.
        </p>
        <Link className="mt-4 inline-block text-teal-700 underline" to="/adminpro">
          Volver al panel central
        </Link>
      </main>
    );

  if (pathname === "/adminpro") return <PlatformAdminDashboard />;
  if (pathname === "/dashboard") return <TenantCompanyDashboard />;
  if (pathname === "/productos") return <TenantInventoryPreview />;
  if (pathname === "/contactos") return <TenantSuppliersPreview />;
  if (pathname === "/compras") return <TenantOrdersPreview />;
  if (pathname === "/movimientos") return <TenantMovementsPreview />;

  // These routes already render dedicated, company-scoped read-only components.
  // The authenticated route verifies membership; their own queries enforce company_id and RLS.
  if (pathname === "/documento-cubicacion" || pathname === "/panel-gerencial") {
    return <>{children}</>;
  }

  // Gate all authenticated legacy pages, including nested routes.
  // Only the public landing/auth pages remain available.
  if (
    pathname !== "/" &&
    pathname !== "/auth" &&
    pathname !== "/login" &&
    pathname !== "/registro" &&
    pathname !== "/recuperar-contrasena" &&
    pathname !== "/mfa"
  ) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-12" role="status">
        <h1 className="text-2xl font-bold">Módulo en adaptación multiempresa</h1>
        <p className="mt-3 text-sm text-slate-600">
          Esta pantalla utiliza consultas de BodegaPro que todavía no están limitadas a una empresa.
          Su acceso está temporalmente deshabilitado para impedir que se mezclen datos entre
          organizaciones.
        </p>
      </main>
    );
  }
  return <>{children}</>;
}
