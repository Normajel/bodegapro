export type CubicationProduct = {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  stock: number;
  unit_cost: number;
};

export type CubicationLine = { product: CubicationProduct; quantity: number };

export type CubicationGroup = {
  category: string;
  lines: (CubicationLine & { subtotal: number })[];
  subtotal: number;
};

export type CubicationParams = {
  otherCosts: number;
  adminPct: number;
  retailMarginPct: number;
  distributorMarginPct: number;
};

export function groupByCategory(lines: CubicationLine[]): CubicationGroup[] {
  const groups = new Map<string, CubicationGroup>();
  for (const line of lines) {
    const category = line.product.category?.trim() || "SIN CATEGORÍA";
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
    .sort((a, b) => a.category.localeCompare(b.category, "es"));
}

export function computeCosts(groups: CubicationGroup[], params: CubicationParams) {
  const materials = groups.reduce((sum, group) => sum + group.subtotal, 0);
  const fabrication = materials + params.otherCosts;
  const administrative = (fabrication * params.adminPct) / 100;
  const total = fabrication + administrative;
  return {
    materials,
    fabrication,
    administrative,
    total,
    retailPrice: total * (1 + params.retailMarginPct / 100),
    distributorPrice: total * (1 + params.distributorMarginPct / 100),
  };
}
