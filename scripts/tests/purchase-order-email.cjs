// Isolated Edge handler test: real PDF generation, fake Auth/DB and mail transport.
// No network requests or emails are made by this test.
const fs = require("node:fs");
const assert = require("node:assert/strict");
const ts = require("typescript");
const source = fs
  .readFileSync("supabase/functions/send-purchase-order/index.ts", "utf8")
  .replace(/npm:@supabase\/supabase-js@[\d.]+/g, "@supabase/supabase-js")
  .replace(/npm:jspdf-autotable@[\d.]+/g, "jspdf-autotable")
  .replace(/npm:jspdf@[\d.]+/g, "jspdf");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const id = "00000000-0000-4000-8000-000000000001";
const payload = {
  existing: false,
  event: {
    id,
    status: "processing",
    recipient: "supplier@example.com",
    subject: "Orden de compra TEST",
  },
  order: {
    order_number: "OC-TEST",
    order_date: "2026-11-01",
    payment_terms: "credito_30_dias",
    payment_terms_other: null,
    description: "Prueba de PDF",
    notes: null,
    net_total: 1000,
    vat_amount: 190,
    total_amount: 1190,
    delivery_days: 5,
  },
  supplier: {
    name: "Proveedor de prueba",
    rut: "1-9",
    address: "Dirección",
    email: "supplier@example.com",
  },
  company: {
    name: "INTEGRASTOCK",
    rut: "1-9",
    address: "Dirección",
    business_activity: "Bodega",
    email: "test@example.com",
  },
  items: Array.from({ length: 75 }, (_, i) => ({
    description: "Producto o servicio de prueba " + i,
    quantity: 1,
    measure_unit: "UN",
    unit_cost: 1000,
    line_total: 1000,
    item_type: i % 2 ? "servicio" : "producto",
  })),
};
async function run(options = {}) {
  let handler,
    mail,
    mailCalls = 0;
  const recorded = [];
  const env = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "public",
    SUPABASE_SERVICE_ROLE_KEY: "server",
    RESEND_API_KEY: "test-key",
    PURCHASE_ORDER_FROM_EMAIL: "test@example.com",
    ...options.env,
  };
  const userClient = {
    auth: {
      getUser: async () => ({ data: { user: options.noUser ? null : { id } }, error: null }),
    },
    rpc: async () => ({
      data: options.payload ?? payload,
      error: options.permission ? { message: "No tienes permiso" } : null,
    }),
  };
  const admin = {
    rpc: async () => ({
      data: {
        enabled: true,
        api_key: env.RESEND_API_KEY,
        from_email: env.PURCHASE_ORDER_FROM_EMAIL,
        domain: "example.com",
        domain_id: id,
        ...options.mailConfig,
      },
      error: options.configError ? { message: "unavailable" } : null,
    }),
    from: () => ({
      update: (v) => {
        recorded.push(v);
        return {
          eq: () => ({
            eq: async () => ({ error: options.recordError ? { message: "DB unavailable" } : null }),
          }),
        };
      },
    }),
  };
  const localRequire = (name) =>
    name === "@supabase/supabase-js"
      ? { createClient: (_url, key) => (key === "server" ? admin : userClient) }
      : require(name);
  const transport = async (_url, init) => {
    if (_url.includes("/domains/")) {
      if (options.domainError) throw new Error("Domain unavailable");
      return new Response(
        JSON.stringify({
          id,
          name: "example.com",
          status: options.domainStatus ?? "verified",
          capabilities: { sending: options.sendingCapability ?? "enabled" },
        }),
      );
    }
    mailCalls++;
    mail = JSON.parse(init.body);
    if (options.transportError) throw new Error("Timeout");
    return new Response(JSON.stringify(options.provider ?? { id: "provider-test-id" }), {
      status: options.http ?? 200,
    });
  };
  const mod = { exports: {} };
  new Function("require", "module", "exports", "Deno", "fetch", compiled)(
    localRequire,
    mod,
    mod.exports,
    {
      env: { get: (k) => env[k] },
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
        ...(options.unauth ? {} : { Authorization: "Bearer test" }),
      },
      body: JSON.stringify({ order_id: id, request_id: id, recipient: "attacker@example.com" }),
    }),
  );
  return { code: response.status, result: await response.json(), recorded, mail, mailCalls };
}
(async () => {
  assert.equal((await run({ unauth: true })).code, 401);
  assert.equal((await run({ noUser: true })).code, 401);
  assert.equal((await run({ permission: true })).code, 403);
  let r = await run({ env: { RESEND_API_KEY: "" } });
  assert.equal(r.code, 503);
  assert.equal(r.recorded[0].status, "failed");
  assert.equal(r.mailCalls, 0);
  r = await run();
  assert.equal(r.code, 200);
  assert.equal(r.result.status, "sent");
  assert.equal(r.recorded[0].status, "sent");
  assert.deepEqual(r.mail.to, ["supplier@example.com"]);
  assert.equal(r.mail.from, '\"INTEGRASTOCK — vía BodegaPro\" <test@example.com>');
  assert.equal(r.mail.reply_to, "test@example.com");
  assert(r.mail.text.includes("INTEGRASTOCK le envía"));
  assert(r.mail.text.includes("test@example.com"));
  assert(
    Buffer.from(r.mail.attachments[0].content, "base64").subarray(0, 4).equals(Buffer.from("%PDF")),
  );
  assert(r.mail.attachments[0].filename.endsWith(".pdf"));
  r = await run({ env: { PURCHASE_ORDER_FROM_EMAIL: "shared@example.com" } });
  assert.equal(r.mail.from, '\"INTEGRASTOCK — vía BodegaPro\" <shared@example.com>');
  assert.equal(r.mail.reply_to, "test@example.com");
  r = await run({
    payload: {
      ...payload,
      company: {
        ...payload.company,
        name: 'Empresa "Sur" <Cliente>',
        email: "replies@example.org",
      },
    },
  });
  assert.equal(
    r.mail.from,
    JSON.stringify('Empresa "Sur" <Cliente> — vía BodegaPro') + " <test@example.com>",
  );
  assert.equal(r.mail.reply_to, "replies@example.org");
  for (const company of [
    null,
    { ...payload.company, name: " " },
    { ...payload.company, email: "" },
    { ...payload.company, email: "a@example.com,other@example.com" },
    { ...payload.company, email: "a@example.com\r\nBcc:other@example.com" },
  ]) {
    const invalid = await run({ payload: { ...payload, company } });
    assert.equal(invalid.code, 422);
    assert.equal(invalid.recorded[0].status, "failed");
    assert.equal(invalid.mailCalls, 0);
  }
  for (const options of [
    { mailConfig: { enabled: false } },
    { configError: true },
    { domainStatus: "pending" },
    { domainError: true },
    { sendingCapability: "disabled" },
    { mailConfig: { from_email: "other@wrong-domain.cl" } },
  ]) {
    const blocked = await run(options);
    assert.equal(blocked.code, 503);
    assert.equal(blocked.mailCalls, 0);
    assert.equal(blocked.recorded[0].status, "failed");
  }
  r = await run({ env: { PURCHASE_ORDER_FROM_EMAIL: "invalid" } });
  assert.equal(r.code, 503);
  assert.equal(r.mailCalls, 0);
  r = await run({
    payload: { ...payload, existing: true, event: { ...payload.event, status: "sent" } },
  });
  assert.equal(r.result.status, "sent");
  assert.equal(r.mailCalls, 0);
  r = await run({ payload: { ...payload, existing: true } });
  assert.equal(r.code, 202);
  assert.equal(r.mailCalls, 0);
  r = await run({ transportError: true });
  assert.equal(r.recorded[0].status, "unknown");
  assert.equal(r.result.status, "unknown");
  r = await run({ http: 422 });
  assert.equal(r.recorded[0].status, "failed");
  r = await run({ http: 500 });
  assert.equal(r.recorded[0].status, "unknown");
  r = await run({ provider: {} });
  assert.equal(r.result.status, "unknown");
  r = await run({ recordError: true });
  assert.equal(r.result.status, "unknown");
  assert.equal(r.code, 502);
  console.log(
    "PASS: email/PDF, shared sender and company reply address cases; no real network or email, long multi-page PDF generated.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
