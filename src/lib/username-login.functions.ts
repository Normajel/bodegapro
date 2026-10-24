import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(32),
  password: z.string().min(1).max(128),
  captchaToken: z.string().min(1).max(4096),
});

const GENERIC_ERROR = "Usuario o contraseña incorrectos, o verificación de seguridad inválida.";

// Resuelve el correo interno en el servidor para no exponerlo al navegador.
export const signInWithUsername = createServerFn({ method: "POST" })
  .validator((input: unknown) => loginSchema.parse(input))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
    const publishableKey =
      process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !publishableKey) throw new Error("Faltan variables de entorno de Supabase");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("username", data.username)
      .maybeSingle();

    if (!profile?.email) throw new Error(GENERIC_ERROR);

    const authClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });
    const { data: result, error } = await authClient.auth.signInWithPassword({
      email: profile.email,
      password: data.password,
      options: { captchaToken: data.captchaToken },
    });

    if (error || !result.session) throw new Error(GENERIC_ERROR);

    return {
      accessToken: result.session.access_token,
      refreshToken: result.session.refresh_token,
    };
  });
