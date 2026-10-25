import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  ShoppingCart,
  Users,
  FileBarChart,
  Calculator,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppAccessContext, hasPermission } from "@/lib/permissions";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Panel", icon: LayoutDashboard, module: "dashboard" },
  { to: "/productos", label: "Inventario", icon: Package, module: "inventory" },
  { to: "/compras", label: "Ordenes de Compra", icon: ShoppingCart, module: "purchases" },
  { to: "/movimientos", label: "Movimientos", icon: ArrowLeftRight, module: "movements" },
  { to: "/contactos", label: "Contactos", icon: Users, module: "contacts" },
  { to: "/informes", label: "Informes", icon: FileBarChart, module: "reports" },
  { to: "/cubicacion", label: "Cubicación", icon: Calculator, module: "reports" },
  { to: "/configuracion", label: "Configuración", icon: Settings, module: "settings" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const {
    data: access,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["current-user-access"],
    queryFn: async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error("No se encontró la sesión activa");

      const { data, error } = await supabase
        .from("profiles")
        .select("role_id, app_roles(name, permissions)")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data.app_roles;
    },
  });

  const visibleNavItems = NAV_ITEMS.filter(({ module }) =>
    module === "settings"
      ? access?.name === "ADMIN"
      : hasPermission(access?.name, access?.permissions, module),
  );
  const activeModule = NAV_ITEMS.find(({ to }) => pathname.startsWith(to))?.module;
  const canViewCurrentPage =
    activeModule === "settings"
      ? access?.name === "ADMIN"
      : !activeModule || hasPermission(access?.name, access?.permissions, activeModule);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      {visibleNavItems.map(({ to, label, icon: Icon }) => {
        const active = pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-sidebar-accent text-sidebar-primary"
                : "text-sidebar-foreground hover:bg-sidebar-accent"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Cargando permisos…
      </div>
    );
  }

  if (isError || !access) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="card max-w-md space-y-3 p-6 text-center">
          <h1 className="font-semibold">No se pudo cargar tu perfil</h1>
          <p className="text-sm text-muted-foreground">
            Contacta a un administrador para verificar tu usuario y sus permisos.
          </p>
          <button className="btn btn-secondary" onClick={handleSignOut}>
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar desktop */}
      <aside className="hidden w-60 flex-col gap-6 border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <Link to="/dashboard" className="flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary font-display text-sm font-bold text-sidebar-primary-foreground">
            B
          </div>
          <span className="font-display text-lg font-bold text-sidebar-foreground">BodegaPro</span>
        </Link>
        {nav}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </aside>

      {/* Header móvil */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
          <span className="font-display text-lg font-bold">BodegaPro</span>
          <button onClick={() => setOpen(!open)} className="btn btn-ghost p-2" aria-label="Menú">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>
        {open && (
          <div className="flex max-h-[calc(100vh-3.5rem)] flex-col gap-1 overflow-y-auto border-b border-border bg-sidebar p-3 md:hidden">
            {visibleNavItems.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </div>
        )}
        <AppAccessContext.Provider value={access}>
          <main className="min-w-0 flex-1 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 md:p-8">
            {canViewCurrentPage ? (
              children
            ) : (
              <div className="card mx-auto max-w-xl space-y-2 p-6 text-center">
                <h1 className="font-semibold">Acceso no habilitado</h1>
                <p className="text-sm text-muted-foreground">
                  Tu perfil no tiene permiso para ver esta sección. Contacta a un administrador si
                  necesitas acceso.
                </p>
              </div>
            )}
          </main>
        </AppAccessContext.Provider>
      </div>
    </div>
  );
}
