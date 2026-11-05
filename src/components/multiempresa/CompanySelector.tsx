import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { loadMyCompanies } from "@/lib/multiempresa/company-api";
import type { CompanyOption } from "@/lib/multiempresa/tenant";
import { publishActiveCompany } from "@/lib/multiempresa/company-context";
import { TenantChatLauncher } from "./TenantChatPanel";
import { TenantChatRoleControls } from "./TenantChatRoleControls";

export function CompanySelector() {
  const queryClient = useQueryClient();
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selected, setSelected] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    let generation = 0;

    function clearTenantContext() {
      // Drop cached rows before another account or company can render.
      queryClient.clear();
      setCompanies([]);
      setSelected("");
      publishActiveCompany(null);
    }

    async function refresh() {
      const requestId = ++generation;
      setLoading(true);
      setError("");
      setSignedIn(false);
      clearTenantContext();
      try {
        const { data, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!live || requestId !== generation) return;
        if (!data.user) return;

        const available = await loadMyCompanies();
        if (!live || requestId !== generation) return;
        // A second user/session change invalidates any in-flight membership read.
        const current = await supabase.auth.getUser();
        if (!live || requestId !== generation) return;
        if (current.error || current.data.user?.id !== data.user.id) {
          throw new Error("La sesión cambió mientras se verificaban las empresas.");
        }
        setCompanies(available);
        setSignedIn(true);
        const initialCompanyId = available.length === 1 ? (available[0]?.company.id ?? "") : "";
        setSelected(initialCompanyId);
        publishActiveCompany(initialCompanyId);
      } catch {
        if (live && requestId === generation) {
          clearTenantContext();
          setSignedIn(false);
          setError("No se pudo verificar tu acceso a empresas.");
        }
      } finally {
        if (live && requestId === generation) setLoading(false);
      }
    }

    void refresh();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        ++generation;
        clearTenantContext();
        setSignedIn(false);
        setLoading(false);
        setError("");
      } else if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        // Defer asynchronous auth API calls outside the synchronous Auth callback.
        queueMicrotask(() => {
          if (live) void refresh();
        });
      }
    });
    return () => {
      live = false;
      ++generation;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  // Public login and landing pages are unaffected.
  if (!signedIn && !loading) return null;
  if (loading) return <div className="border-b p-3 text-sm">Verificando empresa…</div>;

  return (
    <section
      className="border-b border-slate-200 bg-slate-50 px-4 py-3"
      aria-label="Empresa activa"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
        <label htmlFor="active-company" className="text-sm font-semibold text-slate-800">
          Empresa activa
        </label>
        <select
          id="active-company"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          value={selected}
          disabled={!!error || companies.length === 0}
          onChange={(event) => {
            // Clear the prior tenant cache before publishing the next context.
            const nextCompany = event.target.value;
            if (nextCompany && !companies.some(({ company }) => company.id === nextCompany)) return;
            queryClient.clear();
            setSelected(nextCompany);
            publishActiveCompany(nextCompany);
          }}
        >
          <option value="">Selecciona una empresa</option>
          {companies.map(({ company, role }) => (
            <option key={company.id} value={company.id}>
              {company.name} · {role}
            </option>
          ))}
        </select>
        {error && (
          <span role="alert" className="text-sm text-red-700">
            {error}
          </span>
        )}
        {!error && companies.length === 0 && (
          <span className="text-sm text-amber-800">No tienes empresas habilitadas.</span>
        )}
        <span className="text-xs text-amber-800">
          Módulos antiguos aún no adaptados: no usar con datos reales.
        </span>
        {selected && (
          <Link
            to="/documento-cubicacion"
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            Documentos de cubicación
          </Link>
        )}
        {selected &&
          ["ADMIN", "ADMINPRO", "GERENCIA", "GERENTE"].includes(
            companies.find(({ company }) => company.id === selected)?.role ?? "",
          ) && (
            <Link
              to="/panel-gerencial"
              className="rounded border border-teal-600 bg-white px-3 py-2 text-sm font-semibold text-teal-800"
            >
              Panel gerencial
            </Link>
          )}
        {selected && (
          <Link
            to="/notas-venta"
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            Notas de Venta
          </Link>
        )}
        {selected && (
          <nav
            aria-label="Módulos multiempresa disponibles"
            className="flex flex-wrap items-center gap-2"
          >
            {(
              [
                ["/productos", "Inventario"],
                ["/contactos", "Proveedores"],
                ["/compras", "Órdenes de compra"],
                ["/movimientos", "Movimientos"],
              ] as const
            ).map(([to, label]) => (
              <Link
                key={to}
                to={to}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-800"
              >
                {label}
              </Link>
            ))}
          </nav>
        )}
        {selected && <TenantChatLauncher key={selected} companyId={selected} />}
        {selected &&
          ["ADMIN", "ADMINPRO"].includes(
            companies.find(({ company }) => company.id === selected)?.role ?? "",
          ) && <TenantChatRoleControls key={selected} companyId={selected} />}
        <button
          type="button"
          className="ml-auto rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
          onClick={async () => {
            setError("");
            const { error: signOutError } = await supabase.auth.signOut();
            if (signOutError) {
              setError("No se pudo cerrar sesión. Inténtalo de nuevo.");
              return;
            }
            queryClient.clear();
            window.location.assign("/auth");
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </section>
  );
}
