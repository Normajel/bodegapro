import { createFileRoute } from "@tanstack/react-router";
import { TenantCubicationDocumentsPreview } from "@/components/multiempresa/TenantCubicationDocumentsPreview";

export const Route = createFileRoute("/_authenticated/documento-cubicacion")({
  head: () => ({
    meta: [
      { title: "Documentos de cubicación — INTEGRASTOCK Multiempresa" },
      {
        name: "description",
        content: "Consulta de unidades de cubicaje guardadas, separadas por empresa.",
      },
    ],
  }),
  component: TenantCubicationDocumentsPreview,
});
