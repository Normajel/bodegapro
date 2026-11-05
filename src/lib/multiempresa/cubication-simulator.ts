export type SimulationMaterial = {
  id: string;
  name: string;
  category: string;
  unit: string;
  available: number;
  unitCost: number;
  active: boolean;
};
export type SimulationRequirement = { productId: string; quantity: number };
export type SimulationSpecialLine = {
  productId: string;
  name: string;
  quantity: number;
  unitCost: number;
};

function safeNumber(value: number) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function simulateTenantCubication(
  requirements: readonly SimulationRequirement[],
  materials: readonly SimulationMaterial[],
  modules: number,
) {
  if (!Number.isSafeInteger(modules) || modules < 1 || modules > 1000) {
    throw new Error("La cantidad de módulos debe ser un entero entre 1 y 1000.");
  }
  if (requirements.length === 0) {
    return {
      rows: [],
      maxModules: 0,
      totalCost: 0,
      shortageCost: 0,
      coveredCost: 0,
      missingCount: 0,
      unpricedCount: 0,
      missingProductIds: [],
      coveragePercent: null as number | null,
    };
  }
  const byId = new Map(materials.map((p) => [p.id, p]));
  const aggregated = new Map<string, number>();
  for (const line of requirements) {
    if (!line.productId || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      throw new Error("La cubicación contiene cantidades inválidas.");
    }
    aggregated.set(line.productId, (aggregated.get(line.productId) ?? 0) + line.quantity);
  }
  const missingProductIds = [...aggregated.keys()].filter((id) => !byId.get(id)?.active);
  const rows = [...aggregated.entries()].flatMap(([productId, perModule]) => {
    const p = byId.get(productId);
    if (!p || !p.active) return [];
    const required = perModule * modules;
    const available = safeNumber(p.available);
    const missing = Math.max(0, required - available);
    const unitCost = safeNumber(p.unitCost);
    return [
      {
        productId,
        name: p.name,
        category: p.category,
        unit: p.unit,
        perModule,
        required,
        available,
        missing,
        unitCost,
        estimatedCost: required * unitCost,
        shortageCost: missing * unitCost,
        costAvailable: unitCost > 0,
      },
    ];
  });
  const totalCost = rows.reduce((sum, row) => sum + row.estimatedCost, 0);
  const shortageCost = rows.reduce((sum, row) => sum + row.shortageCost, 0);
  const coveredCost = Math.max(0, totalCost - shortageCost);
  const pricedTotal = rows
    .filter((row) => row.costAvailable)
    .reduce((sum, row) => sum + row.estimatedCost, 0);
  const pricedShortage = rows
    .filter((row) => row.costAvailable)
    .reduce((sum, row) => sum + row.shortageCost, 0);
  return {
    rows,
    maxModules: missingProductIds.length
      ? 0
      : Math.max(0, Math.min(...rows.map((row) => Math.floor(row.available / row.perModule)))),
    totalCost,
    shortageCost,
    coveredCost,
    missingCount: rows.filter((row) => row.missing > 0).length + missingProductIds.length,
    unpricedCount: rows.filter((row) => !row.costAvailable).length,
    missingProductIds,
    coveragePercent:
      pricedTotal > 0 ? Math.max(0, Math.min(100, (1 - pricedShortage / pricedTotal) * 100)) : null,
  };
}

/** Special products have no stock by design; never infer possible production from their inventory. */
export function simulateTenantSpecialCubication(
  lines: readonly SimulationSpecialLine[],
  modules: number,
) {
  if (!Number.isSafeInteger(modules) || modules < 1 || modules > 1000) {
    throw new Error("La cantidad de módulos debe ser un entero entre 1 y 1000.");
  }
  const rows = lines.map((line) => {
    if (!line.productId || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      throw new Error("La cubicación especial contiene cantidades inválidas.");
    }
    return {
      ...line,
      required: line.quantity * modules,
      estimatedCost: line.quantity * modules * safeNumber(line.unitCost),
      costAvailable: safeNumber(line.unitCost) > 0,
    };
  });
  return {
    rows,
    totalCost: rows.reduce((sum, row) => sum + row.estimatedCost, 0),
    unpricedCount: rows.filter((row) => !row.costAvailable).length,
  };
}
