import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { loadMyCompanies } from "@/lib/multiempresa/company-api";
import type { CompanyOption } from "@/lib/multiempresa/tenant";

export const COMPANY_CONTEXT_EVENT = "integrastock:company-changed";

export function CompanySelector() {
  const queryClient = useQueryClient();
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selected, setSelected] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    async function refresh() {
      setLoading(true);
      try {
        const { data, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!live) return;
        setSignedIn(!!data.user);
        if (!data.user) {
          setCompanies([]);
          setSelected("");
          window.dispatchEvent(new CustomEvent(COMPANY_CONTEXT_EVENT, { detail: { companyId: "" } }));
          return;
        }
        const available = await loadMyCompanies();
        if (!live) return;
        setCompanies(available);
        const initialCompanyId = available.length === 1 ? (available[0]?.company.id ?? "") : "";
        setSelected(initialCompanyId);
        queryClient.clear();
        window.dispatchEvent(new CustomEvent(COMPANY_CONTEXT_EVENT, {
          detail: { companyId: initialCompanyId },
        }));
        setError("");
      } catch {
        if (live) {
          setCompanies([]);
          setSelected("");
          setError("No se pudo verificar tu acceso a empresas.");
        }
      } finally {
        if (live) setLoading(false);
      }
    }
    void refresh();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setSignedIn(false);
        setCompanies([]);
        setSelected("");
        window.dispatchEvent(new CustomEvent(COMPANY_CONTEXT_EVENT, { detail: { companyId: "" } }));
        queryClient.clear();
      } else if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        void refresh();
      }
    });
    return () => { live = false; subscription.unsubscribe(); };
  }, [queryClient]);

  // Public login and landing pages are unaffected.
  if (!signedIn && !loading) return null;
  if (loading) return <div className="border-b p-3 text-sm">Verificando empresa…</div>;

  return (
    <section className="border-b border-slate-200 bg-slate-50 px-4 py-3" aria-label="Empresa activa">
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
            window.dispatchEvent(new CustomEvent(COMPANY_CONTEXT_EVENT, {
              detail: { companyId: nextCompany },
            }));
          }}
        >
          <option value="">Selecciona una empresa</option>
          {companies.map(({ company, role }) => (
            <option key={company.id} value={company.id}>{company.name} · {role}</option>
          ))}
        </select>
        {error && <span role="alert" className="text-sm text-red-700">{error}</span>}
        {!error && companies.length === 0 && <span className="text-sm text-amber-800">No tienes empresas habilitadas.</span>}
        <span className="text-xs text-amber-800">
          Módulos antiguos aún no adaptados: no usar con datos reales.
        </span>
      </div>
    </section>
  );
}
