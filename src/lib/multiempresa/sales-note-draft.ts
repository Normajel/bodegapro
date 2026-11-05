export const SALES_NOTE_WRITES_ENABLED = false;

export type SalesNoteDraft = {
  companyId: string;
  customerId: string;
  number: string;
  notes: string;
  units: Array<{ kind: "normal" | "especial"; documentId: string; modules: string }>;
};

export function prepareTenantSalesNote(draft: SalesNoteDraft) {
  if (!draft.companyId || !draft.customerId) throw new Error("Selecciona empresa y cliente.");
  const number = draft.number.trim();
  if (!number || number.length > 60) throw new Error("Ingresa un número de NV válido.");
  if (draft.notes.length > 500) throw new Error("Las observaciones superan 500 caracteres.");
  if (draft.units.length < 1 || draft.units.length > 50) {
    throw new Error("Agrega entre 1 y 50 unidades.");
  }
  let totalModules = 0;
  const units = draft.units.map((unit) => {
    if (!["normal", "especial"].includes(unit.kind) || !unit.documentId) {
      throw new Error("Cada unidad debe tener una cubicación guardada.");
    }
    if (!/^[1-9][0-9]*$/.test(unit.modules)) {
      throw new Error("La cantidad de módulos debe ser un entero positivo.");
    }
    const modules = Number(unit.modules);
    if (!Number.isSafeInteger(modules) || modules > 1000)
      throw new Error("Máximo 1.000 módulos por unidad.");
    totalModules += modules;
    if (totalModules > 1000) throw new Error("Máximo 1.000 módulos por NV.");
    return { kind: unit.kind, document_id: unit.documentId, modules };
  });
  return {
    companyId: draft.companyId,
    customerId: draft.customerId,
    number,
    notes: draft.notes.trim() || null,
    units,
    totalModules,
  };
}
