export type CubicationProduct = {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  stock: number;
  unit_cost: number;
};

export type CubicationLine = {
  product: CubicationProduct;
  quantity: number;
  isSpecial?: boolean;
  specialId?: string;
};

export type CubicationGroup = {
  category: string;
  lines: (CubicationLine & { subtotal: number })[];
  subtotal: number;
};

export const CUBICATION_CATEGORIES = [
  "ESTRUCTURA",
  "PINTURA",
  "CARPINTERIA",
  "PISO LINOLEO",
  "CIRCUITO ELECTRICO",
  "ARTEFACTO ELECTRICO",
  "FUSION",
  "ARTEFACTO GASFITERIA",
  "DETALLE",
] as const;

export const CUBICATION_COST_FIELDS = [
  { key: "structure", label: "Estructura*" },
  { key: "error", label: "M. Error" },
  { key: "carpentry", label: "Carpintería*" },
  { key: "miscellaneous", label: "Varios" },
  { key: "linoleum", label: "Linóleo*" },
  { key: "paint", label: "Pintura*" },
  { key: "fabrication", label: "Costo Fabricación" },
  { key: "administrative", label: "Costo Adm" },
] as const;

export type CubicationCostKey = (typeof CUBICATION_COST_FIELDS)[number]["key"];

export type CubicationCostBreakdown = Record<
  CubicationCostKey | "publicPrice" | "distributorPrice",
  string
>;

export const EMPTY_CUBICATION_COSTS: CubicationCostBreakdown = {
  structure: "",
  error: "",
  carpentry: "",
  miscellaneous: "",
  linoleum: "",
  paint: "",
  fabrication: "",
  administrative: "",
  publicPrice: "",
  distributorPrice: "",
};

function toCostNumber(value: string) {
  const parsed = Number(value.replace(",", "."));
  return value.trim() && Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function calculateCubicationTotal(materials: number, breakdown: CubicationCostBreakdown) {
  return (
    materials +
    CUBICATION_COST_FIELDS.reduce((sum, field) => sum + toCostNumber(breakdown[field.key]), 0)
  );
}

export function normalizeCubicationCostBreakdown(value: unknown): CubicationCostBreakdown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_CUBICATION_COSTS };
  }

  const values = value as Partial<Record<keyof CubicationCostBreakdown, unknown>>;
  return Object.fromEntries(
    Object.keys(EMPTY_CUBICATION_COSTS).map((key) => [
      key,
      typeof values[key as keyof CubicationCostBreakdown] === "string" ||
      typeof values[key as keyof CubicationCostBreakdown] === "number"
        ? String(values[key as keyof CubicationCostBreakdown])
        : "",
    ]),
  ) as CubicationCostBreakdown;
}

export function normalizeCubicationCategory(category: string) {
  const trimmed = category.trim();
  return trimmed.toLocaleUpperCase("es-CL") === "DETALLES" ? "DETALLE" : trimmed;
}

export function groupByCategory(lines: CubicationLine[]): CubicationGroup[] {
  const groups = new Map<string, CubicationGroup>();
  for (const line of lines) {
    const category = normalizeCubicationCategory(line.product.category) || "SIN CATEGORÍA";
    const subtotal = line.quantity * line.product.unit_cost;
    const group = groups.get(category) ?? { category, lines: [], subtotal: 0 };
    group.lines.push({ ...line, subtotal });
    group.subtotal += subtotal;
    groups.set(category, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      lines: group.lines.sort((a, b) => a.product.name.localeCompare(b.product.name, "es")),
    }))
    .sort((a, b) => {
      const aIndex = CUBICATION_CATEGORIES.indexOf(
        a.category as (typeof CUBICATION_CATEGORIES)[number],
      );
      const bIndex = CUBICATION_CATEGORIES.indexOf(
        b.category as (typeof CUBICATION_CATEGORIES)[number],
      );
      if (aIndex >= 0 || bIndex >= 0) {
        if (aIndex < 0) return 1;
        if (bIndex < 0) return -1;
        return aIndex - bIndex;
      }
      return a.category.localeCompare(b.category, "es");
    });
}
