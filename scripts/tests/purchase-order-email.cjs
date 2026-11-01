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
  assert(
    Buffer.from(r.mail.attachments[0].content, "base64").subarray(0, 4).equals(Buffer.from("%PDF")),
  );
  assert(r.mail.attachments[0].filename.endsWith(".pdf"));
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
  console.log("PASS: 12 email/PDF cases; no real network or email, long multi-page PDF generated.");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
