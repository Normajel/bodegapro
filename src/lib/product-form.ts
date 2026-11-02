// Campos compartidos por el inventario general y el catálogo especial.
export type ProductDetails = {
  name: string;
  category: string;
  unit: string;
  supplier_id: string;
  unit_cost: number;
  barcode: string;
  location: string;
};
export const PRODUCT_UNITS = [
  "unidad",
  "kg",
  "rollo",
  "lata",
  "tambor",
  "mt",
  "lts",
  "m²",
  "m³",
  "caja",
  "par",
];
