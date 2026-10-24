import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

const missingVariables = [
  ...(!supabaseUrl ? ["SUPABASE_URL (o VITE_SUPABASE_URL)"] : []),
  ...(!serviceRoleKey ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
];

if (missingVariables.length > 0) {
  console.error(`Faltan en .env.local: ${missingVariables.join(", ")}.`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const terminal = createInterface({ input: stdin, output: stdout });

try {
  const email = (await terminal.question("Correo del usuario ADMIN: ")).trim().toLowerCase();
  if (!email) throw new Error("Debes indicar el correo del usuario ADMIN.");

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, app_roles(name)")
    .ilike("email", email)
    .limit(10);
  if (profileError) throw new Error(`No se pudo buscar el perfil: ${profileError.message}`);
  if (!profiles) throw new Error("Supabase no devolvió perfiles para esa búsqueda.");

  const adminProfiles = profiles.filter(
    (profile) =>
      profile.email?.trim().toLowerCase() === email && profile.app_roles?.name === "ADMIN",
  );
  if (adminProfiles.length !== 1) {
    throw new Error(
      "No se encontró exactamente un perfil ADMIN con ese correo. Verifica el correo y el proyecto Supabase.",
    );
  }

  const adminProfile = adminProfiles[0];
  const { data: factorData, error: factorsError } = await supabase.auth.admin.mfa.listFactors({
    userId: adminProfile.id,
  });
  if (factorsError)
    throw new Error(`No se pudieron consultar los factores: ${factorsError.message}`);
  if (!factorData) throw new Error("Supabase no devolvió los factores MFA.");

  const totpFactors = factorData.factors.filter((factor) => factor.factor_type === "totp");
  if (totpFactors.length === 0) {
    console.log(
      "Supabase no encuentra factores TOTP para ese ADMIN. Comprueba que la app y el script usan el mismo proyecto y usuario.",
    );
    process.exitCode = 2;
  } else {
    console.log(`Se encontraron ${totpFactors.length} factor(es) TOTP para el ADMIN indicado.`);
    const confirmation = await terminal.question(
      `Esto quitará solo esos factores TOTP y cerrará las sesiones activas de esa cuenta. Escribe QUITAR MFA para continuar: `,
    );

    if (confirmation !== "QUITAR MFA") {
      console.log("Cancelado; no se hicieron cambios.");
    } else {
      for (const factor of totpFactors) {
        const { error } = await supabase.auth.admin.mfa.deleteFactor({
          userId: adminProfile.id,
          id: factor.id,
        });
        if (error) throw new Error(`No se pudo quitar un factor TOTP: ${error.message}`);
      }
      console.log(
        "Factores TOTP eliminados. Cierra el navegador local, vuelve a iniciar sesión y configura el MFA escaneando el nuevo QR.",
      );
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Falló la recuperación del MFA.");
  process.exitCode = 1;
} finally {
  terminal.close();
}
