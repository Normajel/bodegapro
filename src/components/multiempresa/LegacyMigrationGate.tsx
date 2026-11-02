import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { TenantInventoryPreview } from "./TenantInventoryPreview";
import { TenantSuppliersPreview } from "./TenantSuppliersPreview";
import { TenantOrdersPreview } from "./TenantOrdersPreview";

/**
 * Fail-closed migration gate: old authenticated routes contain unscoped
 * queries and must NOT render against the new multiempresa backend yet.
 * Replace this gate with tenant-aware per-route loaders only after audit.
 */
export function LegacyMigrationGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [auth, setAuth] = useState<"checking" | "signed-in" | "signed-out">("checking");

  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (alive) setAuth(data.user ? "signed-in" : "signed-out");
    }).catch(() => { if (alive) setAuth("signed-out"); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (!alive) return;
      if (event === "SIGNED_IN") setAuth("signed-in");
      if (event === "SIGNED_OUT") setAuth("signed-out");
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  if (auth === "checking") return <p className="p-6 text-sm">Verificando sesión…</p>;
  if (auth === "signed-out") return <>{children}</>;

  if (pathname === "/productos") return <TenantInventoryPreview />;
  if (pathname === "/contactos") return <TenantSuppliersPreview />;
  if (pathname === "/ordenes-compra") return <TenantOrdersPreview />;

  // Gate all authenticated legacy pages, including nested routes.
  // Only the public landing/auth pages remain available.
  if (pathname !== "/" && pathname !== "/login" && pathname !== "/registro" && pathname !== "/recuperar-contrasena" && pathname !== "/mfa") {
    return (
      <main className="mx-auto max-w-2xl px-5 py-12" role="status">
        <h1 className="text-2xl font-bold">Módulo en adaptación multiempresa</h1>
        <p className="mt-3 text-sm text-slate-600">
          Esta pantalla utiliza consultas de BodegaPro que todavía no están limitadas
          a una empresa. Su acceso está temporalmente deshabilitado para impedir
          que se mezclen datos entre organizaciones.
        </p>
      </main>
    );
  }
  return <>{children}</>;
}
