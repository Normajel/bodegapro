import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_.-]{2,31}$/, "Usuario de 3 a 32 caracteres: letras, números, _ . -");

const createUserSchema = z.object({
  username: usernameSchema,
  email: z.string().trim().email().max(254),
  fullName: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(128),
  roleId: z.string().uuid(),
});

const updateUserSchema = z.object({
  userId: z.string().uuid(),
  username: usernameSchema,
  email: z.string().trim().email().max(254),
  fullName: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(128).optional(),
  roleId: z.string().uuid().optional(),
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
    if (!["ADMIN", "ADMINPRO"].includes(currentProfile.app_roles?.name ?? "")) {
      throw new Error("Solo un usuario administrador puede crear cuentas");
    }
    if (context.claims["aal"] !== "aal2") {
      throw new Error("Se requiere verificar el segundo factor para administrar usuarios");
    }

    const { data: role, error: roleError } = await context.supabase
      .from("app_roles")
      .select("id, name")
      .eq("id", data.roleId)
      .single();

    if (roleError) throw new Error(`No se pudo validar el perfil: ${roleError.message}`);
    if (role.name === "ADMIN" || role.name === "ADMINPRO")
      throw new Error(
        "No se pueden asignar los perfiles ADMIN o ADMINPRO desde el alta de usuarios",
      );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: takenUsername } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", data.username)
      .maybeSingle();
    if (takenUsername) throw new Error("Ese nombre de usuario ya está en uso");

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
        username: data.username,
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

export const updateManagedUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: currentProfile, error: profileError } = await context.supabase
      .from("profiles")
      .select("app_roles(name)")
      .eq("id", context.userId)
      .single();

    if (profileError)
      throw new Error(`No se pudo verificar el administrador: ${profileError.message}`);
    if (!["ADMIN", "ADMINPRO"].includes(currentProfile.app_roles?.name ?? "")) {
      throw new Error("Solo un usuario administrador puede modificar cuentas");
    }
    if (context.claims["aal"] !== "aal2") {
      throw new Error("Se requiere verificar el segundo factor para administrar usuarios");
    }

    const { data: profile, error: targetError } = await context.supabase
      .from("profiles")
      .select("id, full_name, email, username, role_id, app_roles(name)")
      .eq("id", data.userId)
      .single();

    if (targetError) throw new Error(`No se pudo encontrar el usuario: ${targetError.message}`);

    const isAdminAccount = ["ADMIN", "ADMINPRO"].includes(profile.app_roles?.name ?? "");
    if (isAdminAccount && data.roleId && data.roleId !== profile.role_id) {
      throw new Error("No se puede cambiar el perfil de una cuenta administradora");
    }

    let roleId = profile.role_id;
    if (!isAdminAccount) {
      if (!data.roleId) throw new Error("Selecciona un perfil");
      const { data: role, error: roleError } = await context.supabase
        .from("app_roles")
        .select("id, name")
        .eq("id", data.roleId)
        .single();
      if (roleError) throw new Error(`No se pudo validar el perfil: ${roleError.message}`);
      if (role.name === "ADMIN" || role.name === "ADMINPRO") {
        throw new Error("No se pueden asignar los perfiles ADMIN o ADMINPRO");
      }
      roleId = role.id;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: takenUsername } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", data.username)
      .neq("id", data.userId)
      .maybeSingle();
    if (takenUsername) throw new Error("Ese nombre de usuario ya está en uso");

    const { error: profileUpdateError } = await supabaseAdmin
      .from("profiles")
      .update({
        username: data.username,
        email: data.email,
        full_name: data.fullName,
        role_id: roleId,
      })
      .eq("id", data.userId);

    if (profileUpdateError) {
      throw new Error(`No se pudo actualizar el perfil: ${profileUpdateError.message}`);
    }

    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email: data.email,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
      ...(data.password ? { password: data.password } : {}),
    });

    if (authUpdateError) {
      const { error: rollbackError } = await supabaseAdmin
        .from("profiles")
        .update({
          username: profile.username,
          email: profile.email,
          full_name: profile.full_name,
          role_id: profile.role_id,
        })
        .eq("id", data.userId);
      if (rollbackError) {
        console.error(
          "No se pudo revertir el perfil tras fallar la actualización de Auth:",
          rollbackError,
        );
      }
      throw new Error(`No se pudo actualizar la cuenta: ${authUpdateError.message}`);
    }

    return { id: data.userId, passwordUpdated: Boolean(data.password) };
  });
