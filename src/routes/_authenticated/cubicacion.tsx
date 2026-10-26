import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CubicationWindow } from "@/components/cubication-window";
import { UNIDADES } from "@/lib/warehouse";

export const Route = createFileRoute("/_authenticated/cubicacion")({
  head: () => ({
    meta: [
      { title: "Cubicación — BodegaPro" },
      {
        name: "description",
        content: "Planillas de cubicación por unidad: materiales, costos y precios de venta.",
      },
    ],
  }),
  component: CubicacionPage,
});

function CubicacionPage() {
  const [unit, setUnit] = useState<string | null>(null);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-2 py-4 sm:px-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cubicación</h1>
        <p className="text-sm text-muted-foreground">
          Elige la unidad para crear o editar su planilla de materiales. El tipo de unidad se asocia
          después en el documento de venta.
        </p>
      </div>
      <div className="card p-4">
        <label className="label" htmlFor="cubication-unit">
          Unidad de cubicaje
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
      {unit && <CubicationWindow unitCode={unit} onClose={() => setUnit(null)} />}
    </main>
  );
}
