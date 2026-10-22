import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  UNITS,
  CATEGORY_PREFIX,
  lastPurchases,
  periodBounds,
  normalizeCode,
  santiagoDateTimeIso,
} from "@/lib/warehouse";

describe("Reglas de bodega", () => {
  it("define las categorías del inventario con prefijos únicos", () => {
    expect(CATEGORIES).toEqual([
      "ESTRUCTURA",
      "PINTURA",
      "CARPINTERIA",
      "PISO LINOLEO",
      "CIRCUITO ELECTRICO",
      "FUSION",
      "ARTEFACTO ELECTRICO",
      "ARTEFACTO GASFITERIA",
      "DETALLES",
    ]);
    expect(new Set(CATEGORIES.map((category) => CATEGORY_PREFIX[category])).size).toBe(
      CATEGORIES.length,
    );
    expect(CATEGORY_PREFIX["PINTURA"]).toBe("PINT");
  });

  it("ofrece las siete unidades solicitadas", () =>
    expect(UNITS).toEqual(["UN", "KG", "ROLLO", "LATA", "TAMBOR", "MT", "LT"]));

  it("conserva las últimas tres compras y no mezcla salidas ni productos", () => {
    const rows = [10, 20, 30, 40].map((cost, index) => ({
      product_id: "a",
      type: "entrada",
      created_at: `2026-10-${10 + index}`,
      unit_cost: cost,
      quantity_value: 1,
      supplier_id: null,
    }));
    rows.push({ ...rows[3]!, type: "salida", unit_cost: 99 });
    rows.push({ ...rows[3]!, product_id: "b", unit_cost: 88 });
    expect(lastPurchases(rows, "a").map((purchase) => purchase.unit_cost)).toEqual([40, 30, 20]);
  });

  it("últimos siete días incluye hoy y seis anteriores", () =>
    expect(periodBounds("week", "2026-10", new Date("2026-10-17T12:00:00Z"))).toEqual({
      from: "2026-10-11",
      to: "2026-10-17",
    }));

  it("mes calendario incluye los 31 días de octubre", () =>
    expect(periodBounds("month", "2026-10")).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    }));

  it("mes calendario limita febrero a sus días reales", () =>
    expect(periodBounds("month", "2026-02")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    }));

  it("convierte límites de informe a la zona horaria de Santiago", () => {
    expect(santiagoDateTimeIso("2026-07-15")).toBe("2026-07-15T04:00:00.000Z");
    expect(santiagoDateTimeIso("2026-10-15", 24)).toBe("2026-10-16T03:00:00.000Z");
  });

  it("asocia el SKU contenido en un QR", () =>
    expect(normalizeCode("https://example.com/product?sku=ESTR001")).toBe("ESTR001"));
});
