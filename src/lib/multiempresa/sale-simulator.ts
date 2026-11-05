import {
  simulateTenantCubication,
  simulateTenantSpecialCubication,
  type SimulationMaterial,
} from "./cubication-simulator";

export type SaleScenarioItem = {
  key: string;
  kind: "normal" | "especial";
  documentId: string;
  unitCode: string;
  modules: number;
  lines: Array<{
    productId: string;
    quantity: number;
    name?: string;
    unitCost?: number;
  }>;
};

export function simulateTenantSaleScenario(
  items: readonly SaleScenarioItem[],
  materials: readonly SimulationMaterial[],
) {
  if (!items.length || items.length > 50) {
    throw new Error("La Nota de Venta de prueba debe incluir entre 1 y 50 unidades.");
  }
  const unique = new Set<string>();
  const normalMaterials = new Map<string, number>();
  const special = new Map<string, {
    productId: string;
    name: string;
    required: number;
    unitCost: number;
    costAvailable: boolean;
  }>();
  let modules = 0;
  const units = items.map((item) => {
    if (!item.key || unique.has(item.key)) throw new Error("Cada unidad de la simulación debe ser única.");
    unique.add(item.key);
    if (!item.documentId || !item.unitCode.trim() || !["normal", "especial"].includes(item.kind)
      || !Number.isSafeInteger(item.modules) || item.modules < 1 || item.modules > 1000
      || item.lines.length < 1 || item.lines.length > 1000) {
      throw new Error("Una unidad tiene cubicación o cantidad inválida.");
    }
    modules += item.modules;
    for (const line of item.lines) {
      if (!line.productId || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
        throw new Error("La cubicación contiene cantidades inválidas.");
      }
      const required = line.quantity * item.modules;
      if (!Number.isSafeInteger(required)) throw new Error("Cantidad de material fuera de rango.");
      if (item.kind === "normal") {
        normalMaterials.set(line.productId, (normalMaterials.get(line.productId) ?? 0) + required);
      } else {
        if (line.unitCost === undefined || !Number.isFinite(line.unitCost) || line.unitCost < 0) {
          throw new Error("Hay un costo especial inválido.");
        }
        const previous = special.get(line.productId);
        if (previous && previous.unitCost !== line.unitCost) {
          throw new Error("Un mismo producto especial tiene precios diferentes. Revisa sus cubicaciones.");
        }
        special.set(line.productId, {
          productId: line.productId,
          name: line.name?.trim() || "Producto especial",
          required: (previous?.required ?? 0) + required,
          unitCost: line.unitCost,
          costAvailable: line.unitCost > 0,
        });
      }
    }
    return {
      key: item.key, kind: item.kind, documentId: item.documentId,
      unitCode: item.unitCode, modules: item.modules,
    };
  });
  if (modules > 1000) throw new Error("La simulación total no puede superar 1.000 módulos.");

  // Stock is compared once against the entire sale, never separately per unit.
  const normalResult = normalMaterials.size
    ? simulateTenantCubication(
        [...normalMaterials].map(([productId, quantity]) => ({ productId, quantity })),
        materials, 1,
      )
    : null;

  // Special products are purchases without inventory; using a separate pricing path.
  const specialResult = special.size
    ? simulateTenantSpecialCubication(
        [...special.values()].map((row) => ({
          productId: row.productId, name: row.name,
          quantity: row.required, unitCost: row.unitCost,
        })), 1,
      )
    : null;

  const normalRows = normalResult?.rows.map((row) => ({
    ...row, perModule: null as number | null,
  })) ?? [];
  const specialRows = specialResult?.rows ?? [];
  const missingReferences = normalResult?.missingProductIds ?? [];
  const unpricedCount = (normalResult?.unpricedCount ?? 0) + (specialResult?.unpricedCount ?? 0);
  const cost = (normalResult?.totalCost ?? 0) + (specialResult?.totalCost ?? 0);
  const normalShortageCost = normalResult?.shortageCost ?? 0;
  const specialAcquisitionCost = specialResult?.totalCost ?? 0;

  return {
    units, totalModules: modules, normalRows, specialRows, missingReferences,
    missingMaterials: (normalResult?.missingCount ?? 0) + specialRows.length,
    normalShortageCost, specialAcquisitionCost,
    estimatedAcquisitionCost: normalShortageCost + specialAcquisitionCost,
    totalEstimatedMaterialCost: cost,
    unpricedCount,
    normalAvailabilityCovered: normalResult
      ? normalResult.missingCount === 0 && !missingReferences.length
      : true,
    capacityWarning: "La capacidad representa disponibilidad para esta NV; no considera tiempos, reservas de otras ventas ni mano de obra.",
  };
}
