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
