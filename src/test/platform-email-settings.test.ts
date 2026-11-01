import { describe, expect, it } from "vitest";
import {
  validateIdentity,
  validateApiKey,
  domainVerified,
  publicStatus,
  safeDnsRecords,
} from "../../supabase/functions/platform-email-settings/config";

describe("platform email credential and domain safeguards", () => {
  it("requires the sender mailbox to belong exactly to the configured domain", () => {
    expect(validateIdentity(" MAIL.Example.com ", " Orders@Mail.Example.com ")).toEqual({
      domain: "mail.example.com",
      from_email: "orders@mail.example.com",
    });
    for (const domain of [
      "https://example.com",
      "localhost",
      "example.com/path",
      "-example.com",
      "example.com:443",
    ])
      expect(() => validateIdentity(domain, "orders@example.com")).toThrow();
    for (const email of [
      "orders@sub.example.com",
      "orders@example.com.evil.com",
      "A <orders@example.com>",
      "orders@example.com\r\nBcc:x@example.com",
      "orders@example.com,other@example.com",
    ])
      expect(() => validateIdentity("example.com", email)).toThrow();
  });
  it("rejects malformed keys and preserves an existing key when left blank", () => {
    expect(validateApiKey("")).toBeNull();
    expect(validateApiKey(undefined)).toBeNull();
    expect(validateApiKey("re_testKeyForTests1234")).toBe("re_testKeyForTests1234");
    expect(() => validateApiKey("re_key\r\nHeader: malicious")).toThrow();
  });
  it("requires verified status, sending capability and the exact domain name", () => {
    const domain = {
      id: "test",
      name: "example.com",
      status: "verified",
      capabilities: { sending: "enabled" },
    };
    expect(domainVerified(domain, "example.com")).toBe(true);
    expect(domainVerified({ ...domain, name: "other.com" }, "example.com")).toBe(false);
    expect(domainVerified({ ...domain, status: "pending" }, "example.com")).toBe(false);
    expect(
      domainVerified({ ...domain, capabilities: { sending: "disabled" } }, "example.com"),
    ).toBe(false);
    expect(domainVerified({ ...domain, capabilities: {} }, "example.com")).toBe(false);
  });
  it("never returns private credentials or Vault identifiers in public status", () => {
    const result = publicStatus({
      domain: "example.com",
      api_key: "re_fakeOnlyTest123456",
      secret_id: "vault-secret",
      domain_id: "internal",
      audit: [{ action: "save", api_key: "hidden" }],
    });
    expect(result.key_configured).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(
      /re_fake|vault-secret|hidden|api_key|secret_id|domain_id/,
    );
    expect(
      safeDnsRecords([
        { type: "TXT", name: "dkim", value: "public DNS record", status: "pending" },
      ]),
    ).toHaveLength(1);
  });
});
