import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CubicationWindow } from "@/components/cubication-window";
import { UNIDADES } from "@/lib/warehouse";
import { UNIT_TYPE_LABELS } from "@/lib/comprobante-pdf";

export const Route = createFileRoute("/_authenticated/cubicacion")({
  head: () => ({
    meta: [
      { title: "Cubicación — BodegaPro" },
      {
        name: "description",
        content:
          "Plantillas de cubicación por tipo de unidad: materiales, costos y precios de venta.",
      },
    ],
  }),
  component: CubicacionPage,
});

function CubicacionPage() {
  const [unitType, setUnitType] = useState("stock");
  const [unit, setUnit] = useState<string | null>(null);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-2 py-4 sm:px-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cubicación</h1>
        <p className="text-sm text-muted-foreground">
          Elige el tipo de unidad y la unidad para crear o editar su lista de materiales, ver sus
          costos y los precios de venta sugeridos.
        </p>
      </div>
      <div className="card grid gap-3 p-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="cubication-unit-type">
            Tipo de unidad
          </label>
          <select
            id="cubication-unit-type"
            className="input"
            value={unitType}
            onChange={(event) => setUnitType(event.target.value)}
          >
            {Object.entries(UNIT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="cubication-unit">
            Unidad
          </label>
          <select
            id="cubication-unit"
            className="input"
            value={unit ?? ""}
            onChange={(event) => setUnit(event.target.value || null)}
          >
            <option value="">Selecciona una unidad…</option>
            {UNIDADES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
      </div>
      {unit && (
        <CubicationWindow unitType={unitType} unitCode={unit} onClose={() => setUnit(null)} />
      )}
    </main>
  );
}
