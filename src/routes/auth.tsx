import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadMyCompanies } from "@/lib/multiempresa/company-api";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acceder — INTEGRASTOCK Multiempresa" },
      { name: "description", content: "Acceso autorizado a INTEGRASTOCK Multiempresa." },
    ],
  }),
  component: TenantAuthPage,
});

/**
 * This development branch authenticates directly against its isolated
 * Supabase Auth project. User creation and password recovery remain
 * under administrator control until onboarding is implemented.
 */
function TenantAuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      // Authentication alone is not tenant authorization.
      const allowed = await loadMyCompanies();
      if (allowed.length === 0) {
        await supabase.auth.signOut();
        setMessage("La cuenta no tiene una empresa activa asignada. Contacta a Administración.");
        return;
      }
      await navigate({ to: allowed.some((membership) => membership.role === "ADMINPRO") ? "/adminpro" : "/dashboard" });
    } catch {
      setMessage(
        "No se pudo iniciar sesión. Verifica tus credenciales o consulta al administrador.",
      );
    } finally {
      setPassword("");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">INTEGRASTOCK Multiempresa</h1>
        <p className="mt-2 text-sm text-slate-600">
          Accede con la cuenta asignada a tu empresa. Solo se muestran empresas con membresía
          activa.
        </p>
        <form onSubmit={handleSignIn} className="mt-6 space-y-4">
          <div>
            <label htmlFor="tenant-email" className="block text-sm font-semibold">
              Correo electrónico
            </label>
            <input
              id="tenant-email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="tenant-password" className="block text-sm font-semibold">
              Contraseña
            </label>
            <input
              id="tenant-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </div>
          {message && (
            <p role="alert" className="text-sm text-red-700">
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Verificando acceso…" : "Iniciar sesión"}
          </button>
        </form>
        <p className="mt-4 text-xs text-amber-800">
          Entorno multiempresa en pruebas. No ingreses credenciales de Contemar.
        </p>
      </section>
    </main>
  );
}
