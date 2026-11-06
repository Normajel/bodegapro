import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const allowedOrigin = "https://integrastock-multiempresa.vercel.app";
const cors = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (status: number, message: string) =>
  new Response(JSON.stringify({ ok: status < 400, message }), { status, headers: cors });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return reply(405, "Método no permitido.");
  if (request.headers.get("origin") !== allowedOrigin) return reply(403, "Origen no permitido.");
  const auth = request.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(auth)) return reply(401, "Inicia sesión.");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return reply(503, "Servicio de invitaciones no configurado.");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: caller, error: callerError } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (callerError || !caller.user) return reply(401, "La sesión no es válida.");
  const { data: platformAdmin } = await admin.from("platform_administrators")
    .select("user_id").eq("user_id", caller.user.id).maybeSingle();
  if (!platformAdmin) return reply(403, "Solo Administración Central puede enviar invitaciones.");
  let raw: Record<string, unknown>;
  try { raw = await request.json(); } catch { return reply(400, "Solicitud inválida."); }
  const companyId = typeof raw.companyId === "string" ? raw.companyId : "";
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  const role = typeof raw.role === "string" ? raw.role : "";
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(companyId) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      !["ADMIN", "GERENCIA", "GERENTE", "BODEGA", "VENTAS", "JEFE_PRODUCCION"].includes(role)) {
    return reply(400, "Revisa empresa, correo y perfil.");
  }
  const { data: company } = await admin.from("companies").select("id,name,status").eq("id", companyId).maybeSingle();
  if (!company || company.status !== "active") return reply(404, "Empresa no disponible.");
  // Check plan capacity through a caller-authorized RPC, never by exposing billing tables.
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) return reply(503, "Configuración de autenticación incompleta.");
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: eligible, error: eligibleError } = await userClient.rpc("platform_invitation_eligibility", { p_company_id: companyId });
  if (eligibleError || !eligible?.allowed) {
    return reply(409, eligible?.reason === "limit" ? "Se alcanzó el máximo de usuarios del plan." : "La empresa necesita una suscripción activa con cupos.");
  }
  const { data: previous } = await admin.from("platform_member_invitations")
    .select("id,status,user_id").eq("company_id", companyId).eq("email", email).maybeSingle();
  if (previous?.status === "sent" || previous?.status === "accepted") {
    return reply(409, "Ya existe una invitación para este correo en esta empresa.");
  }
  // Supabase Auth generates and sends the verification/invitation email.
  // No password, service key or invitation token is returned to the caller.
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: allowedOrigin + "/auth",
    data: { invited_to_platform: "integrastock" },
  });
  if (inviteError || !invited.user) {
    return reply(409, "No se pudo enviar la invitación. Confirma Auth Email/SMTP y que la cuenta no esté registrada.");
  }
  const { error: memberError } = await admin.from("company_memberships").upsert({
    company_id: companyId, user_id: invited.user.id, role_code: role, status: "active",
  }, { onConflict: "company_id,user_id" });
  if (memberError) return reply(500, "Invitación enviada, pero no pudo completarse el acceso. Contacta a soporte antes de reintentar.");
  const { error: recordError } = await admin.from("platform_member_invitations").upsert({
    company_id: companyId, email, user_id: invited.user.id, role_code: role,
    invited_by: caller.user.id, status: "sent",
  }, { onConflict: "company_id,email" });
  if (recordError) return reply(500, "Usuario invitado; pendiente de registrar auditoría. Contacta a soporte.");
  await admin.from("platform_admin_events").insert({
    actor_user_id: caller.user.id, action: "invite_user",
    subject_id: companyId, detail: { email, role },
  });
  return reply(200, "Invitación enviada. El acceso requiere completar la verificación del correo.");
});
