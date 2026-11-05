/** Keep both transitions disabled until real two-company Auth/MFA tests. */
export const NV_SUBMISSION_WRITES_ENABLED = false;
export const NV_APPROVAL_WRITES_ENABLED = false;

export type SalesNoteStatus = "BORRADOR" | "PENDIENTE" | "APROBADA" | "ANULADA";
export type NvTransitionRole = "ADMIN" | "ADMINPRO" | "GERENCIA" | "GERENTE" | "VENTAS" | "VENTA" | "BODEGA";

export function canSubmitNv(role: string | null, status: string) {
  return status === "BORRADOR" &&
    ["ADMIN", "ADMINPRO", "VENTAS", "VENTA"].includes(role ?? "");
}

export function canApproveNv(role: string | null, status: string, aal: string | null) {
  return status === "PENDIENTE" && aal === "aal2" &&
    ["GERENCIA", "GERENTE", "ADMIN", "ADMINPRO"].includes(role ?? "");
}

export const nvStatusLabel = (status: string) => {
  switch (status) {
    case "BORRADOR": return "Borrador";
    case "PENDIENTE": return "Pendiente de Gerencia";
    case "APROBADA": return "Aprobada · pendiente de producción";
    case "ANULADA": return "Anulada";
    default: return "Estado no reconocido";
  }
};
