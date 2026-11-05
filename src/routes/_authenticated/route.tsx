import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { loadMyCompanies } from "@/lib/multiempresa/company-api";

// Restrict legacy routes before their content renders. Unadapted pages must not
// run against the new multi-company schema.
const enabledReadOnlyPaths = new Set([
  "/productos",
  "/contactos",
  "/compras",
  "/movimientos",
  "/documento-cubicacion",
  "/panel-gerencial",
  "/notas-venta",
]);

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) throw redirect({ to: "/auth" });
    if (!enabledReadOnlyPaths.has(location.pathname.replace(/\/$/, ""))) {
      throw redirect({ to: "/" });
    }
    const companies = await loadMyCompanies();
    if (companies.length === 0) throw redirect({ to: "/" });
  },
  component: () => <Outlet />,
});
