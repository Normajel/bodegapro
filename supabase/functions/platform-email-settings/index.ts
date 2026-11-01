import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import {
  validateIdentity,
  validateApiKey,
  domainVerified,
  safeDnsRecords,
  publicStatus,
  type DomainInfo,
} from "./config.ts";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
class RequestError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
async function resend(key: string, path: string, method = "GET") {
  let response: Response;
  try {
    response = await fetch("https://api.resend.com" + path, {
      method,
      headers: { Authorization: "Bearer " + key },
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new RequestError("No se pudo conectar con Resend. Intenta nuevamente.", 502);
  }
  if (!response.ok)
    throw new RequestError(
      response.status === 401 || response.status === 403
        ? "Resend rechazó la clave o sus permisos. Usa una clave con acceso a dominios y envío."
        : "Resend no pudo completar la operación. Revisa el dominio e intenta nuevamente.",
      502,
    );
  try {
    return await response.json();
  } catch {
    throw new RequestError("Respuesta de Resend inválida.", 502);
  }
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return json({});
  if (req.method !== "POST") return json({ message: "Método no permitido" }, 405);
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) throw new RequestError("Debes iniciar sesión.", 401);
    const token = authorization.slice(7);
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { ...options, global: { headers: { Authorization: authorization } } },
    );
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) throw new RequestError("Sesión inválida.", 401);
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (
      claimsError ||
      claimsData?.claims?.sub !== userData.user.id ||
      claimsData.claims.aal !== "aal2"
    )
      throw new RequestError("Verifica el segundo factor para administrar el correo.", 403);
    const { data: owner, error: ownerError } = await userClient.rpc("is_platform_owner");
    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("app_roles(name)")
      .eq("id", userData.user.id)
      .single();
    if (ownerError || !owner || profileError || profile?.app_roles?.name !== "ADMINPRO")
      throw new RequestError("Solo el propietario ADMINPRO puede administrar el correo.", 403);
    // Bound request size and never log credential-bearing input or provider responses.
    const raw = await req.text();
    if (raw.length > 4096) throw new RequestError("Solicitud demasiado grande.", 413);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new RequestError("Solicitud inválida.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new RequestError("Solicitud inválida.");
    const action = body.action;
    if (!["status", "save", "verify", "enable", "disable"].includes(String(action)))
      throw new RequestError("Acción inválida.");
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      options,
    );
    const { data: config, error: configError } = await admin.rpc("get_platform_email_config");
    if (configError || !config)
      throw new RequestError("No se pudo leer la configuración de correo.", 500);
    if (action === "status") return json(publicStatus(config));
    if (!Number.isInteger(body.revision) || body.revision !== config.revision)
      throw new RequestError("La configuración cambió. Actualiza antes de continuar.", 409);
    let next = { ...config };
    let newKey: string | null = null;
    if (action === "save") {
      let identity;
      try {
        identity = validateIdentity(body.domain, body.from_email);
        newKey = validateApiKey(body.api_key);
      } catch (error) {
        throw new RequestError(error instanceof Error ? error.message : "Datos inválidos.");
      }
      const key = newKey ?? config.api_key;
      if (!key) throw new RequestError("Ingresa la clave de Resend para conectar el dominio.");
      // Find an existing domain registered by the owner in Resend; never create or alter DNS automatically.
      let after = "",
        found: DomainInfo | undefined;
      for (let page = 0; page < 20; page++) {
        const list = await resend(
          key,
          "/domains?limit=100" + (after ? "&after=" + encodeURIComponent(after) : ""),
        );
        if (!Array.isArray(list.data))
          throw new RequestError("Respuesta de dominios inválida.", 502);
        found = list.data.find((d: DomainInfo) => d.name === identity.domain);
        if (found || !list.has_more) break;
        after = list.data.at(-1)?.id;
        if (!after) break;
      }
      if (!found)
        throw new RequestError(
          "Agrega primero este dominio en tu cuenta de Resend y vuelve a guardar la conexión.",
          422,
        );
      const domain: DomainInfo = await resend(key, "/domains/" + encodeURIComponent(found.id));
      if (domain.name !== identity.domain || !/^[0-9a-f-]{36}$/i.test(domain.id))
        throw new RequestError("Resend devolvió otro dominio.", 502);
      next = {
        ...next,
        ...identity,
        domain_id: domain.id,
        enabled: false,
        domain_status: domainVerified(domain, identity.domain) ? "verified" : "pending",
        dns_records: safeDnsRecords(domain.records),
        checked_at: new Date().toISOString(),
      };
    } else if (action === "disable") {
      next.enabled = false;
    } else {
      if (!config.api_key || !config.domain_id)
        throw new RequestError("Primero guarda la conexión con Resend.");
      const path = "/domains/" + encodeURIComponent(config.domain_id);
      if (action === "verify") await resend(config.api_key, path + "/verify", "POST");
      const domain: DomainInfo = await resend(config.api_key, path);
      const verified = domainVerified(domain, config.domain);
      next = {
        ...next,
        domain_status: verified ? "verified" : "pending",
        dns_records: safeDnsRecords(domain.records),
        checked_at: new Date().toISOString(),
        enabled: verified && (action === "enable" || config.enabled),
      };
      if (action === "enable" && !verified)
        throw new RequestError(
          "El dominio aún no está verificado para envío. Revisa los registros DNS.",
          422,
        );
    }
    const { error: saveError } = await admin.rpc("set_platform_email_config", {
      p_revision: config.revision,
      p_actor: userData.user.id,
      p_action: action,
      p_settings: {
        domain: next.domain,
        from_email: next.from_email,
        domain_id: next.domain_id,
        enabled: next.enabled,
        domain_status: next.domain_status,
        dns_records: next.dns_records,
        checked_at: next.checked_at,
      },
      p_api_key: newKey,
    });
    if (saveError)
      throw new RequestError("No se guardó la configuración. Actualiza y vuelve a intentar.", 409);
    const { data: saved, error: readError } = await admin.rpc("get_platform_email_config");
    if (readError || !saved)
      throw new RequestError("Configuración guardada. Actualiza para ver su estado.", 500);
    return json(publicStatus(saved));
  } catch (error) {
    return json(
      {
        message:
          error instanceof RequestError
            ? error.message
            : "No se pudo completar la configuración de correo.",
      },
      error instanceof RequestError ? error.status : 500,
    );
  }
});
