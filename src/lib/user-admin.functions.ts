import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createUserSchema = z.object({
  email: z.string().trim().email().max(254),
  fullName: z.string().trim().min(1).max(120),
  password: z.string().min(10).max(128),
  roleId: z.string().uuid(),
});

export const createManagedUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: currentProfile, error: profileError } = await context.supabase
      .from("profiles")
      .select("role_id, app_roles(name)")
      .eq("id", context.userId)
      .single();

    if (profileError)
      throw new Error(`No se pudo verificar el administrador: ${profileError.message}`);
    if (currentProfile.app_roles?.name !== "ADMIN") {
      throw new Error("Solo un usuario ADMIN puede crear cuentas");
    }

    const { data: role, error: roleError } = await context.supabase
      .from("app_roles")
      .select("id, name")
      .eq("id", data.roleId)
      .single();

    if (roleError) throw new Error(`No se pudo validar el perfil: ${roleError.message}`);
    if (role.name === "ADMIN")
      throw new Error("No se puede asignar ADMIN desde el alta de usuarios");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });

    if (createError) throw new Error(`No se pudo crear el usuario: ${createError.message}`);
    if (!created.user) throw new Error("Supabase no devolvió el usuario creado");

    const { error: assignError } = await supabaseAdmin
      .from("profiles")
      .update({
        email: data.email,
        full_name: data.fullName,
        role_id: role.id,
      })
      .eq("id", created.user.id);

    if (assignError) {
      const { error: rollbackError } = await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      if (rollbackError) {
        console.error("No se pudo revertir la cuenta creada sin perfil asignado:", rollbackError);
      }
      throw new Error(`No se pudo asignar el perfil del usuario: ${assignError.message}`);
    }

    return { id: created.user.id, email: created.user.email ?? data.email };
  });
