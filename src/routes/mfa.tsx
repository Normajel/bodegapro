import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/mfa")({
  ssr: false,

beforeLoad: async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw redirect({ to: "/auth" });
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;

  if (!user) {
    throw redirect({ to: "/auth" });
  }
},

  component: AdminMfaPage,
});

function AdminMfaPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [factorId, setFactorId] = useState("");
  const [setupStarted, setSetupStarted] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [manualSecret, setManualSecret] = useState("");
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadMfaState() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) {
          await navigate({ to: "/auth", replace: true });
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("app_roles(name)")
          .eq("id", user.id)
          .single();
        if (profileError) throw profileError;
        if (profile.app_roles?.name !== "ADMIN" && profile.app_roles?.name !== "ADMINPRO") {
          await navigate({ to: "/dashboard", replace: true });
          return;
        }
        if (cancelled) return;
        setIsAdmin(true);

        const { data: assurance, error: assuranceError } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assuranceError) throw assuranceError;
        if (assurance.currentLevel === "aal2") {
          await navigate({ to: "/dashboard", replace: true });
          return;
        }

        const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;
        const verifiedFactor = factors.all.find((factor) => factor.factor_type === "totp" && factor.status === "verified");
        if (verifiedFactor) setFactorId(verifiedFactor.id);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "No se pudo comprobar el segundo factor.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadMfaState();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function startEnrollment() {
    setBusy(true);
    setErrorMessage("");
    try {
    const { data: factors, error: factorsError } =
  await supabase.auth.mfa.listFactors();

if (factorsError) throw factorsError;

const verifiedFactor = factors.totp.find(
  (factor) => factor.status === "verified",
);

      if (verifiedFactor) {
        setFactorId(verifiedFactor.id);
        setSetupStarted(false);
        setErrorMessage(
          "Ya existe un factor verificado. Recupéralo o elimínalo desde Supabase antes de configurar uno nuevo.",
        );
        return;
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `BodegaPro-${Date.now()}`,
      });
      if (error) throw error;

      console.log("Formato del QR:", data.totp.qr_code.slice(0, 100));

      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setManualSecret(data.totp.secret);
      setCode("");
      setSetupStarted(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo iniciar la configuración.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId) return;

    setBusy(true);
    setErrorMessage("");
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError) throw challengeError;

      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (error) throw error;
      await navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "El código no se pudo verificar. Comprueba la hora del dispositivo e inténtalo de nuevo.",
      );
    } finally {
      setBusy(false);
      setCode("");
    }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    await navigate({ to: "/auth", replace: true });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Comprobando segundo factor…
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <section className="card w-full max-w-md space-y-5 p-6">
        <div>
          <h1 className="text-xl font-bold">Verificación de administrador</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Para proteger el acceso de ADMIN y ADMINPRO, verifica con una aplicación autenticadora.
          </p>
        </div>

        {errorMessage && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        {setupStarted ? (
  <form onSubmit={verifyCode} className="space-y-4">
    <p className="text-sm">
      Escanea el QR con una aplicación autenticadora y luego ingresa el código de seis
      dígitos.
    </p>

    {qrCode && (
  <img
    className="mx-auto h-48 w-48 rounded bg-white p-2"
    src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      qrCode.replace(/<\?xml[^?]*\?>\s*/i, "").trim(),
    )}`}
    alt="Código QR para configurar la autenticación de dos pasos"
  />
)}

    <details>
      <summary className="cursor-pointer text-sm font-medium">
        No puedo escanear el QR
      </summary>
      <code className="mt-2 block break-all rounded bg-muted p-3 text-xs">
        {manualSecret}
      </code>
    </details>

    <label className="block space-y-1 text-sm" htmlFor="mfa-code">
      Código de autenticación
      <input
        id="mfa-code"
        className="input"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        value={code}
        onChange={(event) =>
          setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
        }
        required
      />
    </label>

    <button
      className="btn btn-primary w-full"
      type="submit"
      disabled={busy || code.length !== 6}
    >
      {busy ? "Verificando…" : "Activar y continuar"}
    </button>
  </form>
) : !factorId ? (
  <div className="space-y-4">
    <p className="text-sm text-muted-foreground">
      Usa una aplicación autenticadora compatible con códigos TOTP. Si pierdes el
      dispositivo, un administrador tendrá que recuperar la cuenta desde Supabase.
    </p>
    <button
      className="btn btn-primary w-full"
      type="button"
      onClick={() => void startEnrollment()}
      disabled={busy}
    >
      {busy ? "Preparando…" : "Configurar segundo factor"}
    </button>
  </div>
          )
        : (
          <form onSubmit={verifyCode} className="space-y-4">
            <label className="block space-y-1 text-sm" htmlFor="mfa-code">
              Código de tu aplicación autenticadora
              <input
                id="mfa-code"
                className="input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                required
              />
            </label>
            <button
              className="btn btn-primary w-full"
              type="submit"
              disabled={busy || code.length !== 6}
            >
              {busy ? "Verificando…" : "Verificar"}
            </button>
          </form>
        )}

        <button className="btn btn-secondary w-full" type="button" onClick={() => void signOut()}>
          Cerrar sesión
        </button>
      </section>
    </main>
  );
}
