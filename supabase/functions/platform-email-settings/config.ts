export type DnsRecord = {
  type: string;
  name: string;
  value: string;
  status: string;
  priority?: number;
};
export type DomainInfo = {
  id: string;
  name: string;
  status: string;
  capabilities?: { sending?: string };
  records?: DnsRecord[];
};
export function validateIdentity(domainValue: unknown, emailValue: unknown) {
  if (typeof domainValue !== "string" || typeof emailValue !== "string")
    throw new Error("Ingresa dominio y correo remitente.");
  const domain = domainValue.trim().toLowerCase();
  const email = emailValue.trim().toLowerCase();
  if (
    domain.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)
  )
    throw new Error("Ingresa un dominio válido, sin https:// ni rutas.");
  if (
    email.length > 254 ||
    !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[^\s@]+$/.test(email) ||
    email.split("@")[1] !== domain
  )
    throw new Error("El correo remitente debe pertenecer exactamente al dominio indicado.");
  return { domain, from_email: email };
}
export function validateApiKey(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^re_[A-Za-z0-9_-]{10,200}$/.test(value.trim()))
    throw new Error("La clave de Resend no tiene un formato válido.");
  return value.trim();
}
export function domainVerified(domain: DomainInfo, expectedName: string) {
  return (
    domain.name === expectedName &&
    domain.status === "verified" &&
    domain.capabilities?.sending === "enabled"
  );
}
export function safeDnsRecords(records: DnsRecord[] | undefined) {
  return (Array.isArray(records) ? records : []).slice(0, 30).map((r) => ({
    type: String(r.type ?? "").slice(0, 20),
    name: String(r.name ?? "").slice(0, 300),
    value: String(r.value ?? "").slice(0, 3000),
    status: String(r.status ?? "").slice(0, 40),
    ...(typeof r.priority === "number" ? { priority: r.priority } : {}),
  }));
}
// Explicit whitelist: neither API keys nor internal Vault identifiers can reach the browser.
export function publicStatus(c: Record<string, unknown>) {
  return {
    domain: c["domain"],
    from_email: c["from_email"],
    enabled: c["enabled"],
    domain_status: c["domain_status"],
    dns_records: c["dns_records"],
    checked_at: c["checked_at"],
    updated_at: c["updated_at"],
    revision: c["revision"],
    key_configured: !!c["api_key"],
    audit: Array.isArray(c["audit"])
      ? c["audit"].map((a: Record<string, unknown>) => ({
          action: a["action"],
          created_at: a["created_at"],
          enabled: a["enabled"],
        }))
      : [],
  };
}
