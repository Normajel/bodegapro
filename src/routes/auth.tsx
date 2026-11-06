import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadMyCompanies } from "@/lib/multiempresa/company-api";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Verificar correo — INTEGRASTOCK Multiempresa" },
      { name: "description", content: "Inicio de sesión mediante código de 6 dígitos." },
    ],
  }),
  component: TenantAuthPage,
});

/**
 * Email OTP is a passwordless sign-in, not an additional MFA factor.
 * Never create accounts from this page; only invited users may request OTP.
 * The Supabase Magic Link template MUST contain {{ .Token }} (not ConfirmationURL).
 */
function TenantAuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const requestCode = async (target: string) => {
    const normalized = target.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: { shouldCreateUser: false },
    });
    if (error) throw error;
    setPendingEmail(normalized);
    setCode("");
    setSuccess("Si el correo tiene una cuenta habilitada, recibirás un código de seis dígitos. Revisa también spam.");
  };

  async function handleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage("");
    setSuccess("");
    try {
      await requestCode(email);
    } catch {
      setMessage("No fue posible solicitar el código. Revisa el correo o intenta nuevamente más tarde.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingEmail || loading || !/^\d{6}$/.test(code)) return;
    setLoading(true);
    setMessage("");
    setSuccess("");
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: pendingEmail,
        token: code,
        type: "email",
      });
      if (error) throw error;
      // Authenticated does not mean authorized to read any tenant.
      const allowed = await loadMyCompanies();
      if (allowed.length === 0) {
        await supabase.auth.signOut();
        setMessage("El correo fue verificado, pero no tiene una empresa activa asignada. Contacta a Administración.");
        setPendingEmail(null);
        return;
      }
      await navigate({
        to: allowed.some((membership) => membership.role === "ADMINPRO")
          ? "/adminpro"
          : "/dashboard",
      });
    } catch {
      setMessage("Código incorrecto o vencido. Verifica los seis números o solicita uno nuevo.");
      // A failed membership lookup after a successful OTP must not leave an unreviewed session.
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        try {
          const allowed = await loadMyCompanies();
          if (!allowed.length) await supabase.auth.signOut();
        } catch {
          await supabase.auth.signOut();
        }
      }
    } finally {
      setCode("");
      setLoading(false);
    }
  }

  async function resendCode() {
    if (!pendingEmail || loading) return;
    setLoading(true);
    setMessage("");
    setSuccess("");
    try {
      await requestCode(pendingEmail);
    } catch {
      setMessage("No se pudo reenviar todavía. Espera antes de solicitar otro código.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">INTEGRASTOCK Multiempresa</h1>
        <p className="mt-2 text-sm text-slate-600">
          Cada nuevo inicio de sesión requiere verificar tu correo mediante un código de 6 dígitos.
          Solo las cuentas invitadas y habilitadas pueden entrar.
        </p>
        {!pendingEmail ? (
          <form onSubmit={handleRequest} className="mt-6 space-y-4">
            <label htmlFor="tenant-email" className="block text-sm font-semibold">
              Correo electrónico
              <input
                id="tenant-email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <button type="submit" disabled={loading} className="w-full rounded-md bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-60">
              {loading ? "Solicitando código…" : "Enviar código a mi correo"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="mt-6 space-y-4">
            <p className="text-sm text-slate-600">Código enviado a <strong>{pendingEmail}</strong>.</p>
            <label htmlFor="tenant-code" className="block text-sm font-semibold">
              Código de verificación
              <input
                id="tenant-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                placeholder="000000"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3 text-center text-2xl tracking-[0.4em]"
              />
            </label>
            <button type="submit" disabled={loading || code.length !== 6} className="w-full rounded-md bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-60">
              {loading ? "Verificando…" : "Verificar e ingresar"}
            </button>
            <div className="flex justify-between gap-3 text-sm">
              <button type="button" disabled={loading} onClick={() => void resendCode()} className="text-teal-700 underline disabled:opacity-50">Reenviar código</button>
              <button type="button" disabled={loading} onClick={() => { setPendingEmail(null); setCode(""); setMessage(""); setSuccess(""); }} className="text-slate-600 underline disabled:opacity-50">Cambiar correo</button>
            </div>
          </form>
        )}
        {success && <p role="status" className="mt-4 text-sm text-teal-700">{success}</p>}
        {message && <p role="alert" className="mt-4 text-sm text-red-700">{message}</p>}
        <p className="mt-5 text-xs text-amber-800">
          Entorno multiempresa en pruebas. No utilices las credenciales de Contemar.
        </p>
      </section>
    </main>
  );
}
