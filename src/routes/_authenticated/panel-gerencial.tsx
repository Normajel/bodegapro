import { createFileRoute } from "@tanstack/react-router";
import { TenantManagementDashboard } from "@/components/multiempresa/TenantManagementDashboard";

export const Route = createFileRoute("/_authenticated/panel-gerencial")({
  head: () => ({
    meta: [
      { title: "Panel Gerencial — INTEGRASTOCK Multiempresa" },
      {
        name: "description",
        content: "Dashboard gerencial segregado por empresa, sin escrituras.",
      },
    ],
  }),
  component: TenantManagementDashboard,
});
