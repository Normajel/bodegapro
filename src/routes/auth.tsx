import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acceder — BodegaPro" },
      { name: "description", content: "Inicia sesión en BodegaPro para gestionar tu bodega." },
      { property: "og:title", content: "Acceder — BodegaPro" },
      { property: "og:description", content: "Inicia sesión en BodegaPro para gestionar tu bodega." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Cuenta creada. Revisa tu correo para confirmarla.");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error de autenticación");
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "lovable") {
    const result = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("No se pudo iniciar sesión");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary font-display text-xl font-bold text-primary-foreground">
            B
          </div>
          <h1 className="text-2xl font-bold tracking-tight">BodegaPro</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestión de bodega para tu equipo
          </p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleEmail} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="label" htmlFor="fullName">Nombre completo</label>
                <input
                  id="fullName"
                  className="input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            )}
            <div>
              <label className="label" htmlFor="email">Correo electrónico</label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="password">Contraseña</label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? "Cargando…" : mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
            </button>
          </form>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">o continúa con</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-2">
            <button
              type="button"
              className="btn btn-secondary w-full"
              onClick={() => handleOAuth("google")}
            >
              Google
            </button>
            <button
              type="button"
              className="btn btn-secondary w-full"
              onClick={() => handleOAuth("lovable")}
            >
              Lovable
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          {mode === "login" ? "¿No tienes cuenta?" : "¿Ya tienes cuenta?"}{" "}
          <button
            className="font-semibold text-foreground underline-offset-2 hover:underline"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? "Regístrate" : "Inicia sesión"}
          </button>
        </p>
      </div>
    </div>
  );
}
