import { describe, expect, it } from "vitest";
import {
  calculateCubicationTotal,
  EMPTY_CUBICATION_COSTS,
  groupByCategory,
  normalizeCubicationCostBreakdown,
  type CubicationCostBreakdown,
} from "@/lib/cubication";

describe("Costos de planillas de cubicación", () => {
  it("deja en blanco los campos editables al crear una planilla", () => {
    expect(EMPTY_CUBICATION_COSTS).toEqual({
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
    });
  });

  it("calcula el costo total como materiales más todos los costos rellenados", () => {
    const breakdown: CubicationCostBreakdown = {
      ...EMPTY_CUBICATION_COSTS,
      structure: "1200",
      error: "300,5",
      carpentry: "",
      miscellaneous: "50",
      linoleum: "0",
      paint: "100",
      fabrication: "200",
      administrative: "75",
      publicPrice: "",
      distributorPrice: "",
    };

    expect(calculateCubicationTotal(1000, breakdown)).toBe(2925.5);
  });

  it("conserva ventas en blanco y normaliza una estructura guardada", () => {
    expect(
      normalizeCubicationCostBreakdown({
        structure: 500,
        publicPrice: "",
      }),
    ).toEqual({
      ...EMPTY_CUBICATION_COSTS,
      structure: "500",
    });
  });

  it("ordena las categorías requeridas y muestra DETALLE en singular", () => {
    const groups = groupByCategory(
      ["DETALLES", "FUSION", "ARTEFACTO ELECTRICO", "ESTRUCTURA", "PINTURA"].map(
        (category, index) => ({
          product: {
            id: String(index),
            name: `Producto ${index}`,
            sku: "",
            category,
            unit: "UN",
            stock: 0,
            unit_cost: 100,
          },
          quantity: 1,
        }),
      ),
    );

    expect(groups.map((group) => group.category)).toEqual([
      "ESTRUCTURA",
      "PINTURA",
      "ARTEFACTO ELECTRICO",
      "FUSION",
      "DETALLE",
    ]);
  });
});
