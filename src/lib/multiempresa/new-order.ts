export type PurchaseOrderKind = "producto" | "servicio";

export type NewOrderLine = {
  productId: string;
  description: string;
  unit: string;
  quantity: string;
  unitCost: string;
};

export type NewOrderDraft = {
  companyId: string;
  kind: PurchaseOrderKind;
  supplierId: string;
  orderNumber: string;
  paymentTerms: string;
  notes: string;
  lines: NewOrderLine[];
};

export type PreparedNewOrder = {
  companyId: string;
  kind: PurchaseOrderKind;
  supplierId: string;
  orderNumber: string;
  paymentTerms: string;
  notes: string | null;
  items: Array<{
    product_id: string | null;
    description: string;
    measure_unit: string;
    quantity: number;
    unit_cost: number;
  }>;
  netTotal: number;
  vatAmount: number;
  totalAmount: number;
};

export type OrderCatalogSupplier = { id: string; supplier_kind: string };
export type OrderCatalogProduct = {
  id: string;
  name: string;
  unit: string;
  active: boolean;
};

export function prepareNewOrder(
  draft: NewOrderDraft,
  suppliers: readonly OrderCatalogSupplier[],
  products: readonly OrderCatalogProduct[],
): PreparedNewOrder {
  if (!draft.companyId || !["producto", "servicio"].includes(draft.kind)) {
    throw new Error("Selecciona la empresa y el tipo de orden.");
  }
  const supplier = suppliers.find((entry) => entry.id === draft.supplierId);
  if (!supplier || !(
    supplier.supplier_kind === "ambos" ||
    (draft.kind === "producto" && supplier.supplier_kind === "productos") ||
    (draft.kind === "servicio" && supplier.supplier_kind === "servicios")
  )) {
    throw new Error("El proveedor no corresponde al tipo de OC.");
  }
  const number = draft.orderNumber.trim();
  if (!number || number.length > 60) throw new Error("Ingresa un número de OC válido.");
  const terms = draft.paymentTerms.trim();
  if (!terms || terms.length > 100) throw new Error("Ingresa las condiciones de pago.");
  if (draft.notes.length > 500) throw new Error("Las observaciones superan 500 caracteres.");
  if (!draft.lines.length || draft.lines.length > 100) {
    throw new Error("Agrega entre 1 y 100 líneas a la OC.");
  }
  const itemIds = new Set<string>();
  const items = draft.lines.map((line) => {
    const description = line.description.trim();
    const unit = line.unit.trim();
    if (!/^\d+$/.test(line.quantity.trim()) || !Number.isSafeInteger(Number(line.quantity)) || Number(line.quantity) <= 0) {
      throw new Error("La cantidad debe ser un entero positivo.");
    }
    if (!/^\d+$/.test(line.unitCost.trim()) || !Number.isSafeInteger(Number(line.unitCost))) {
      throw new Error("El costo debe ser un entero en pesos chilenos.");
    }
    if (!description || description.length > 250 || !unit || unit.length > 50) {
      throw new Error("Completa descripción y unidad de cada línea.");
    }
    if (draft.kind === "producto") {
      const product = products.find((entry) => entry.id === line.productId && entry.active);
      if (!product) throw new Error("Selecciona un producto vigente de esta empresa.");
      if (itemIds.has(product.id)) throw new Error("No repitas el mismo producto; aumenta su cantidad.");
      if (description !== product.name || unit !== product.unit) {
        throw new Error("La descripción y unidad deben corresponder al producto del inventario.");
      }
      itemIds.add(product.id);
    } else if (line.productId) {
      throw new Error("Las OC de servicios no pueden incluir productos.");
    }
    const quantity = Number(line.quantity);
    const unit_cost = Number(line.unitCost);
    if (!Number.isSafeInteger(quantity * unit_cost)) throw new Error("El total excede el rango permitido.");
    return {
      product_id: draft.kind === "producto" ? line.productId : null,
      description,
      measure_unit: unit,
      quantity,
      unit_cost,
    };
  });
  const netTotal = items.reduce((sum, line) => sum + line.quantity * line.unit_cost, 0);
  if (!Number.isSafeInteger(netTotal)) throw new Error("El neto excede el rango permitido.");
  const vatAmount = Math.round(netTotal * 0.19);
  return {
    companyId: draft.companyId,
    kind: draft.kind,
    supplierId: draft.supplierId,
    orderNumber: number,
    paymentTerms: terms,
    notes: draft.notes.trim() || null,
    items,
    netTotal,
    vatAmount,
    totalAmount: netTotal + vatAmount,
  };
}
