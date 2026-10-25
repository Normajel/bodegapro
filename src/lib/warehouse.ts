export const CATEGORIES = [
  "ESTRUCTURA",
  "PINTURA",
  "CARPINTERIA",
  "PISO LINOLEO",
  "CIRCUITO ELECTRICO",
  "FUSION",
  "ARTEFACTO ELECTRICO",
  "ARTEFACTO GASFITERIA",
  "DETALLES",
] as const;

export const UNITS = ["UN", "KG", "ROLLO", "LATA", "TAMBOR", "MT", "LT"] as const;

export const CATEGORY_PREFIX: Record<string, string> = {
  ESTRUCTURA: "ESTR",
  PINTURA: "PINT",
  CARPINTERIA: "CARP",
  "PISO LINOLEO": "PLIN",
  "CIRCUITO ELECTRICO": "CIEL",
  FUSION: "FUS",
  "ARTEFACTO ELECTRICO": "AREL",
  "ARTEFACTO GASFITERIA": "ARGAS",
  DETALLES: "DET",
};

export const UNIDADES = [
  "2102C2OFPL",
  "2111-C2OFBA",
  "2103C2B333",
  "2104 C2VEST",
  "2105 C2COMEDOR",
  "2103-C2BLL",
  "2103C2WCBB",
  "1102-M2OFPL",
  "1111-M2OFBA",
  "M2 BAÑO 3X3X3",
  "1111-20-M2OFBACOMPLETO",
  "1102-10-M2OFDUPLEX",
  "1111-30 M2 MINICABAÑA",
  "1102-30 M2OFBOD",
  "1102-M2SALA MULTIUSO",
  "1202M6X3OFPL",
  "1101M2BOD",
  "1002M1OFPL",
  "1003M1BABA",
  "1002-1M1CGCV",
  "1001M1BOD",
  "3002BCG",
  "BOX40",
] as const;

export const money = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);

export function dateKey(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function santiagoDateTimeIso(day: string, hour = 0) {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const targetUtc = Date.UTC(year, month - 1, date, hour);
  const guess = new Date(targetUtc);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(guess);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const representedUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
  return new Date(targetUtc + (targetUtc - representedUtc)).toISOString();
}

export function periodBounds(mode: "week" | "month", month: string, now = new Date()) {
  if (mode === "month") {
    const [year = 0, monthNumber = 0] = month.split("-").map(Number);
    return {
      from: `${month}-01`,
      to: `${month}-${new Date(year, monthNumber, 0).getDate()}`,
    };
  }
  const to = dateKey(now);
  const d = new Date(`${to}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 6);
  return { from: d.toISOString().slice(0, 10), to };
}

export type Purchase = {
  product_id: string;
  type: string;
  created_at: string;
  unit_cost: number | null;
  quantity_value: number;
  supplier_id: string | null;
  purchase_order?: string | null;
  document_type?: string | null;
  document_number?: string | null;
  id?: string;
};

export function lastPurchases<T extends Purchase>(rows: T[], productId: string) {
  return rows
    .filter((row) => row.product_id === productId && row.type === "entrada")
    .sort(
      (a, b) => b.created_at.localeCompare(a.created_at) || (b.id ?? "").localeCompare(a.id ?? ""),
    )
    .slice(0, 3);
}

export function normalizeCode(value: string) {
  const clean = value.trim();
  try {
    const url = new URL(clean);
    return url.searchParams.get("sku") ?? url.searchParams.get("code") ?? clean;
  } catch {
    return clean;
  }
}
