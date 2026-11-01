// Real account handlers with simulated Auth/DB; no real accounts or requests.
const fs = require("node:fs");
const assert = require("node:assert/strict");
const ts = require("typescript");
const compiled = ts.transpileModule(fs.readFileSync("src/lib/user-admin.functions.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const actorId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const roleId = "00000000-0000-4000-8000-000000000003";
async function run(options = {}) {
  let created = 0,
    updated = 0,
    deleted = 0,
    profileReads = 0;
  const admin = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: options.taken ? { id: userId } : null }),
          neq: () => ({ maybeSingle: async () => ({ data: null }) }),
        }),
      }),
      update: () => ({
        eq: async () => ({ error: options.assignError ? { message: "assignment failed" } : null }),
      }),
    }),
    auth: {
      admin: {
        createUser: async () => {
          created++;
          return { data: { user: { id: userId, email: "sample@example.com" } }, error: null };
        },
        deleteUser: async () => {
          deleted++;
          return { error: null };
        },
        updateUserById: async () => {
          updated++;
          return { error: null };
        },
      },
    },
  };
  const client = {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            if (table === "app_roles")
              return { data: { id: roleId, name: options.targetRole ?? "ADMIN" }, error: null };
            profileReads++;
            return {
              data:
                profileReads === 1
                  ? { app_roles: { name: options.actorRole ?? "ADMINPRO" } }
                  : {
                      id: options.self ? actorId : userId,
                      role_id: roleId,
                      username: "existing",
                      email: "existing@example.com",
                      full_name: "Existing",
                      app_roles: { name: options.targetRole ?? "ADMINPRO" },
                    },
              error: null,
            };
          },
        }),
      }),
    }),
    rpc: async () => ({ data: options.owner !== false, error: options.ownerError ? {} : null }),
  };
  const exports = {};
  new Function("require", "exports", compiled)((name) => {
    if (name === "@tanstack/react-start")
      return {
        createServerFn: () => ({
          middleware() {
            return this;
          },
          validator(fn) {
            this.validate = fn;
            return this;
          },
          handler(fn) {
            return (args) => fn({ ...args, data: this.validate(args.data) });
          },
        }),
      };
    if (name.includes("auth-middleware")) return { requireSupabaseAuth: {} };
    if (name.includes("client.server")) return { supabaseAdmin: admin };
    return require(name);
  }, exports);
  let error;
  try {
    await exports[options.update ? "updateManagedUser" : "createManagedUser"]({
      data: {
        username: options.update ? "existing" : "Admin_1",
        email: "sample@example.com",
        fullName: "Admin_1",
        password: "FakeTestPassword1234",
        roleId,
        ...(options.update ? { userId: options.self ? actorId : userId } : {}),
      },
      context: { supabase: client, userId: actorId, claims: { aal: options.aal ?? "aal2" } },
    });
  } catch (e) {
    error = e;
  }
  return { created, updated, deleted, error };
}
(async () => {
  let r = await run();
  assert.equal(r.created, 1);
  assert.equal(r.error, undefined);
  for (const options of [
    { actorRole: "ADMIN", owner: false },
    { owner: false },
    { ownerError: true },
    { aal: "aal1" },
    { actorRole: "BODEGA" },
    { targetRole: "ADMINPRO" },
  ]) {
    r = await run(options);
    assert(r.error);
    assert.equal(r.created, 0);
  }
  r = await run({ actorRole: "ADMIN", owner: false, targetRole: "GERENCIA" });
  assert.equal(r.created, 1);
  assert.equal(r.error, undefined);
  r = await run({ taken: true });
  assert(r.error);
  assert.equal(r.created, 0);
  r = await run({ assignError: true });
  assert(r.error);
  assert.equal(r.created, 1);
  assert.equal(r.deleted, 1);
  r = await run({ update: true, actorRole: "ADMIN", owner: false });
  assert(r.error);
  assert.equal(r.updated, 0);
  r = await run({ update: true, self: true });
  assert.equal(r.error, undefined);
  assert.equal(r.updated, 1);
  console.log(
    "PASS: owner-only ADMIN creation, MFA, role restrictions, Gerencia creation, username collision, rollback and ADMINPRO account protection; no real accounts created.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
