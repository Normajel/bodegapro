import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const resetDataSchema = z.object({
  ownerCode: z.string().min(20).max(256),
});

async function matchesOwnerCode(candidate: string, configuredCode: string) {
  const encoder = new TextEncoder();
  const [candidateHash, configuredHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(candidate)),
    crypto.subtle.digest("SHA-256", encoder.encode(configuredCode)),
  ]);
  const candidateBytes = new Uint8Array(candidateHash);
  const configuredBytes = new Uint8Array(configuredHash);
  let difference = 0;

  for (let index = 0; index < candidateBytes.length; index++) {
    difference |= candidateBytes[index]! ^ configuredBytes[index]!;
  }
  return difference === 0;
}

export const resetBusinessData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => resetDataSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("app_roles(name)")
      .eq("id", context.userId)
      .single();

    if (profileError) throw new Error(`No se pudo verificar el perfil: ${profileError.message}`);
    if (profile.app_roles?.name !== "ADMIN") {
      throw new Error("Solo un usuario ADMIN puede reiniciar los datos");
    }
    if (context.claims["aal"] !== "aal2") {
      throw new Error("Se requiere verificar el segundo factor para reiniciar los datos");
    }

    const ownerCode = process.env["BODEGAPRO_RESET_CODE"];
    if (!ownerCode || ownerCode.length < 20) {
      throw new Error(
        "Configura BODEGAPRO_RESET_CODE con al menos 20 caracteres en el entorno privado del servidor.",
      );
    }
    if (!(await matchesOwnerCode(data.ownerCode, ownerCode))) {
      throw new Error("El código de autorización no es válido");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("reset_business_data");
    if (error) throw new Error(`No se pudieron reiniciar los datos: ${error.message}`);

    return { success: true };
  });
