// Runs the real admin handler with simulated Auth/DB/Resend. No real requests or mail.
const fs = require("node:fs");
const assert = require("node:assert/strict");
const ts = require("typescript");
function compile(path) {
  return ts.transpileModule(
    fs
      .readFileSync(path, "utf8")
      .replace(/npm:@supabase\/supabase-js@[\d.]+/g, "@supabase/supabase-js"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
}
const helperModule = { exports: {} };
new Function("exports", compile("supabase/functions/platform-email-settings/config.ts"))(
  helperModule.exports,
);
const compiled = compile("supabase/functions/platform-email-settings/index.ts");
const id = "00000000-0000-4000-8000-000000000001";
const fakeKey = "re_fakeTestCredential12345";
const baseline = {
  domain: "example.com",
  from_email: "orders@example.com",
  domain_id: id,
  api_key: fakeKey,
  enabled: false,
  domain_status: "pending",
  dns_records: [],
  checked_at: null,
  revision: 1,
  audit: [],
};
async function run(options = {}) {
  let handler,
    writes = [],
    network = 0,
    config = { ...baseline, ...options.config };
  const userClient = {
    auth: {
      getUser: async () => ({ data: { user: options.noUser ? null : { id } } }),
      getClaims: async () => ({
        data: { claims: { sub: id, aal: options.aal ?? "aal2" } },
        error: options.claimsError ? {} : null,
      }),
    },
    rpc: async () => ({ data: options.owner !== false, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { app_roles: { name: options.role ?? "ADMINPRO" } } }),
        }),
      }),
    }),
  };
  const admin = {
    rpc: async (name, args) => {
      if (name === "get_platform_email_config") return { data: config };
      writes.push(args);
      if (options.writeError) return { error: { message: "secret diagnostic re_doNotReturn" } };
      config = {
        ...config,
        ...args.p_settings,
        api_key: args.p_api_key ?? config.api_key,
        revision: config.revision + 1,
      };
      return { error: null };
    },
  };
  const domain = {
    id,
    name: options.domainName ?? "example.com",
    status: options.domainStatus ?? "verified",
    capabilities: { sending: options.capability ?? "enabled" },
    records: [{ type: "TXT", name: "dkim", value: "public DNS", status: "verified" }],
  };
  const transport = async (url) => {
    network++;
    if (options.transportError) throw new Error("secret detail " + fakeKey);
    if (options.providerError)
      return new Response(JSON.stringify({ message: "sensitive details " + fakeKey }), {
        status: 403,
      });
    return new Response(
      JSON.stringify(url.includes("?limit=") ? { data: [domain], has_more: false } : domain),
    );
  };
  new Function("require", "exports", "Deno", "fetch", compiled)(
    (name) =>
      name === "./config.ts"
        ? helperModule.exports
        : { createClient: (_url, key) => (key === "service" ? admin : userClient) },
    {},
    {
      env: {
        get: (key) =>
          ({
            SUPABASE_URL: "https://example.supabase.co",
            SUPABASE_ANON_KEY: "anon",
            SUPABASE_SERVICE_ROLE_KEY: "service",
          })[key],
      },
      serve: (fn) => {
        handler = fn;
      },
    },
    transport,
  );
  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options.noAuth ? {} : { Authorization: "Bearer test" }),
      },
      body: JSON.stringify({
        action: options.action ?? "status",
        revision: options.revision ?? 1,
        domain: "example.com",
        from_email: "orders@example.com",
        ...(options.body ?? {}),
      }),
    }),
  );
  const body = await response.json();
  assert(!JSON.stringify(body).includes(fakeKey));
  assert(!JSON.stringify(body).includes("re_doNotReturn"));
  return { code: response.status, body, writes, network };
}
(async () => {
  for (const options of [
    { noAuth: true },
    { noUser: true },
    { aal: "aal1" },
    { claimsError: true },
    { owner: false },
    { role: "ADMIN" },
    { role: "BODEGA" },
  ]) {
    const r = await run(options);
    assert([401, 403].includes(r.code));
    assert.equal(r.writes.length, 0);
    assert.equal(r.network, 0);
  }
  let r = await run();
  assert.equal(r.code, 200);
  assert.equal(r.body.key_configured, true);
  assert.equal(r.body.api_key, undefined);
  r = await run({ action: "save", body: { api_key: fakeKey } });
  assert.equal(r.code, 200);
  assert.equal(r.writes[0].p_api_key, fakeKey);
  assert.equal(r.body.enabled, false);
  r = await run({ action: "save" });
  assert.equal(r.writes[0].p_api_key, null);
  r = await run({ action: "save", body: { from_email: "a@other.com" } });
  assert.equal(r.code, 400);
  assert.equal(r.network, 0);
  r = await run({ action: "save", revision: 0 });
  assert.equal(r.code, 409);
  assert.equal(r.network, 0);
  r = await run({ action: "enable", domainStatus: "pending" });
  assert.equal(r.code, 422);
  r = await run({ action: "enable", capability: "disabled" });
  assert.equal(r.code, 422);
  r = await run({ action: "enable", domainName: "other.com" });
  assert.equal(r.code, 422);
  r = await run({ action: "enable" });
  assert.equal(r.code, 200);
  assert.equal(r.body.enabled, true);
  r = await run({ action: "verify", domainStatus: "pending", config: { enabled: true } });
  assert.equal(r.body.enabled, false);
  r = await run({ action: "disable", config: { enabled: true }, transportError: true });
  assert.equal(r.code, 200);
  assert.equal(r.network, 0);
  assert.equal(r.body.enabled, false);
  r = await run({ action: "save", providerError: true });
  assert.equal(r.code, 502);
  assert.equal(r.writes.length, 0);
  r = await run({ action: "save", transportError: true });
  assert.equal(r.code, 502);
  assert.equal(r.writes.length, 0);
  r = await run({ action: "save", writeError: true });
  assert.equal(r.code, 409);
  console.log(
    "PASS: AdminPro MFA/owner/role guards, secret redaction, domain checks, disable, stale revision, provider and database failures; no real external requests.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
