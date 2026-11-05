import { createFileRoute } from "@tanstack/react-router";
import { TenantSalesNotesPreview } from "@/components/multiempresa/TenantSalesNotesPreview";

export const Route = createFileRoute("/_authenticated/notas-venta")({
  head: () => ({
    meta: [
      { title: "Notas de Venta — INTEGRASTOCK Multiempresa" },
      { name: "description", content: "Notas de Venta y cubicaciones por empresa." },
    ],
  }),
  component: TenantSalesNotesPreview,
});
