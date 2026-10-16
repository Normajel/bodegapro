import { createFileRoute, Link } from "@tanstack/react-router";
import { Package, ArrowLeftRight, AlertTriangle, FileBarChart } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BodegaPro — Gestión de bodega para tu equipo" },
      {
        name: "description",
        content:
          "Controla el inventario de tu bodega: productos, entradas y salidas, alertas de stock bajo, proveedores, clientes e informes.",
      },
      { property: "og:title", content: "BodegaPro — Gestión de bodega para tu equipo" },
      {
        property: "og:description",
        content:
          "Controla el inventario de tu bodega: productos, entradas y salidas, alertas de stock bajo, proveedores, clientes e informes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LandingPage,
});

const FEATURES = [
  { icon: Package, title: "Inventario de productos", text: "Productos con SKU, categoría, ubicación y stock siempre actualizado." },
  { icon: ArrowLeftRight, title: "Entradas y salidas", text: "Registra movimientos y el stock se actualiza automáticamente." },
  { icon: AlertTriangle, title: "Alertas de stock bajo", text: "Define mínimos y detecta al instante qué productos reponer." },
  { icon: FileBarChart, title: "Informes", text: "Hoja de informe por período, exportable a CSV." },
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-display text-sm font-bold text-primary-foreground">
            B
          </div>
          <span className="font-display text-lg font-bold">BodegaPro</span>
        </div>
        <Link to="/auth" className="btn btn-primary">
          Acceder
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-4">
        <section className="py-16 text-center md:py-24">
          <h1 className="mx-auto max-w-2xl font-display text-4xl font-bold tracking-tight md:text-5xl">
            El control de tu bodega, <span className="text-primary">en un solo lugar</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Inventario, movimientos, proveedores, clientes e informes. Datos en tiempo real para todo tu equipo.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/auth" className="btn btn-primary px-6 py-3 text-base">
              Comenzar ahora
            </Link>
          </div>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="card p-6">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <Icon className="h-5 w-5 text-foreground" />
              </div>
              <h2 className="font-display text-lg font-bold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
