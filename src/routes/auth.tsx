import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Turnstile } from "@marsidev/react-turnstile";
import { supabase } from "@/integrations/supabase/client";

const turnstileSiteKey = import.meta.env["VITE_TURNSTILE_SITE_KEY"];

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acceder — BodegaPro" },
      { name: "description", content: "Inicia sesión en BodegaPro para gestionar tu bodega." },
      { property: "og:title", content: "Acceder — BodegaPro" },
      {
        property: "og:description",
        content: "Inicia sesión en BodegaPro para gestionar tu bodega.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaInstance, setCaptchaInstance] = useState(0);
  const [captchaFailed, setCaptchaFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!turnstileSiteKey || !captchaToken) {
      toast.error("Completa la verificación de seguridad antes de iniciar sesión.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
        options: { captchaToken },
      });
      if (error) throw error;
      navigate({ to: "/dashboard" });
    } catch {
      toast.error("No se pudo iniciar sesión. Revisa tus datos y la verificación de seguridad.");
    } finally {
      setCaptchaToken("");
      setCaptchaInstance((instance) => instance + 1);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary font-display text-xl font-bold text-primary-foreground">
            B
          </div>
          <h1 className="text-2xl font-bold tracking-tight">BodegaPro</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gestión de bodega para tu equipo</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleEmail} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                maxLength={254}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {turnstileSiteKey ? (
              <Turnstile
                key={captchaInstance}
                siteKey={turnstileSiteKey}
                onSuccess={(token) => {
                  setCaptchaToken(token);
                  setCaptchaFailed(false);
                }}
                onExpire={() => setCaptchaToken("")}
                onError={() => {
                  setCaptchaToken("");
                  setCaptchaFailed(true);
                }}
              />
            ) : (
              <p className="text-sm text-destructive">
                La verificación de seguridad no está configurada. Contacta al administrador.
              </p>
            )}
            {captchaFailed && (
              <p role="alert" className="text-sm text-destructive">
                No se pudo cargar la verificación. Comprueba tu conexión e inténtalo nuevamente.
              </p>
            )}
            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={loading || !turnstileSiteKey || !captchaToken}
            >
              {loading ? "Cargando…" : "Iniciar sesión"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
