import { createContext, useContext } from "react";
import { canViewManagement } from "./management";

export const PERMISSION_MODULES = [
  { key: "management", label: "Panel Gerencial (Admin y Gerencia)", actions: ["view"] },
  { key: "dashboard", label: "Panel", actions: ["view"] },
  { key: "management", label: "Panel gerencial", actions: ["view"] },
  { key: "inventory", label: "Inventario", actions: ["view", "create", "edit", "delete"] },
  { key: "movements", label: "Movimientos", actions: ["view", "create", "edit", "delete"] },
  {
    key: "purchases",
    label: "Órdenes de compra y servicios",
    actions: ["view", "create", "edit", "delete", "approve", "receive", "send"],
  },
  { key: "contacts", label: "Contactos", actions: ["view", "create", "edit", "delete"] },
  { key: "reports", label: "Informes", actions: ["view"] },
  { key: "cubication", label: "Cubicación", actions: ["view", "edit"] },
  { key: "cubication_document", label: "Documento de cubicación", actions: ["view"] },
  { key: "settings", label: "Configuración de empresa y usuarios", actions: ["manage"] },
  { key: "platform", label: "Panel AdminPro y correo de la plataforma", actions: ["manage"] },
] as const;

export const PERMISSION_ACTIONS = [
  { key: "view", label: "Ver" },
  { key: "create", label: "Crear" },
  { key: "edit", label: "Editar" },
  { key: "delete", label: "Eliminar" },
  { key: "approve", label: "Aprobar órdenes" },
  { key: "receive", label: "Recibir productos" },
  { key: "send", label: "Enviar PDF por correo" },
  { key: "manage", label: "Administrar" },
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number]["key"];
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number]["key"];
export type RolePermissions = Record<string, Record<string, boolean>>;
export type CurrentAccess = {
  name: string;
  permissions: unknown;
  isPlatformOwner?: boolean;
  userId?: string;
};

export const AppAccessContext = createContext<CurrentAccess | null>(null);

export function useAppAccess() {
  return useContext(AppAccessContext);
}

export function isAdminRole(roleName: string | null | undefined) {
  return roleName === "ADMIN" || roleName === "ADMINPRO";
}

export function parseRolePermissions(value: unknown): RolePermissions {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};

  const result: RolePermissions = {};
  for (const [module, actions] of Object.entries(value)) {
    if (typeof actions !== "object" || actions === null || Array.isArray(actions)) continue;
    result[module] = {};
    for (const [action, enabled] of Object.entries(actions)) {
      if (typeof enabled === "boolean") result[module][action] = enabled;
    }
  }
  return result;
}

export function hasPermission(
  roleName: string | null | undefined,
  permissions: unknown,
  module: string,
  action: string = "view",
) {
  if (module === "management") return action === "view" && canViewManagement(roleName, permissions);
  if (roleName === "ADMINPRO") return true;
  return parseRolePermissions(permissions)[module]?.[action] === true;
}

export function canReceivePurchaseOrder(roleName: string | null | undefined, permissions: unknown) {
  const role = roleName?.trim().toUpperCase() ?? "";
  return (
    ["BODEGA", "ADMIN", "ADMINPRO"].includes(role) &&
    hasPermission(role, permissions, "purchases", "view") &&
    hasPermission(role, permissions, "purchases", "receive") &&
    hasPermission(role, permissions, "movements", "create") &&
    (role === "BODEGA" || hasPermission(role, permissions, "purchases", "edit"))
  );
}

export function canApprovePurchaseOrder(roleName: string | null | undefined, permissions: unknown) {
  const role = roleName?.trim().toUpperCase() ?? "";
  return (
    ["GERENCIA", "ADMIN", "ADMINPRO"].includes(role) &&
    hasPermission(role, permissions, "purchases", "view") &&
    hasPermission(role, permissions, "purchases", "approve") &&
    (role !== "ADMIN" || hasPermission(role, permissions, "purchases", "edit"))
  );
}

export function canSendPurchaseOrder(role: string | null | undefined, permissions: unknown) {
  return (
    hasPermission(role, permissions, "purchases", "view") &&
    hasPermission(role, permissions, "purchases", "edit") &&
    hasPermission(role, permissions, "purchases", "send")
  );
}

export function effectiveRolePermission(
  role: string,
  permissions: unknown,
  module: string,
  action: string,
) {
  if (module === "platform") return role === "ADMINPRO";
  if (module === "settings")
    return isAdminRole(role) && hasPermission(role, permissions, module, action);
  if (module === "purchases" && action === "approve")
    return canApprovePurchaseOrder(role, permissions);
  if (module === "purchases" && action === "receive")
    return canReceivePurchaseOrder(role, permissions);
  if (module === "purchases" && action === "send") return canSendPurchaseOrder(role, permissions);
  return hasPermission(role, permissions, module, action);
}

export function canEditRolePermission(
  role: string,
  module: string,
  action: string,
  canManageAdmin = false,
) {
  if (role === "ADMINPRO" || module === "platform") return false;
  if (role === "ADMIN") return canManageAdmin;
  if (module === "settings") return false;
  if (module === "management") return ["GERENCIA", "GERENTE"].includes(role);
  if (module === "purchases" && action === "approve") return role === "GERENCIA";
  if (module === "purchases" && action === "receive") return role === "BODEGA";
  return true;
}

export function updateRolePermission(
  value: unknown,
  module: string,
  action: string,
  enabled: boolean,
  roleName?: string,
): RolePermissions {
  const result = parseRolePermissions(value);
  result[module] = { ...result[module], [action]: enabled };
  if (action === "view" && !enabled) {
    for (const key of Object.keys(result[module])) result[module][key] = false;
  } else if (action !== "view" && action !== "manage" && enabled) result[module]["view"] = true;
  if (module === "purchases") {
    if (action === "send" && enabled) result[module]["edit"] = true;
    if (action === "edit" && !enabled) {
      result[module]["send"] = false;
      if (roleName === "ADMIN") {
        result[module]["approve"] = false;
        result[module]["receive"] = false;
      }
    }
    if (roleName === "ADMIN" && enabled && ["approve", "receive"].includes(action))
      result[module]["edit"] = true;
    if (action === "receive" && enabled)
      result["movements"] = { ...result["movements"], view: true, create: true };
  }
  if (module === "movements" && !enabled && (action === "view" || action === "create"))
    result["purchases"] = { ...result["purchases"], receive: false };
  return result;
}

export function canDelegateRole(
  access: CurrentAccess | null,
  target: { name: string; permissions: unknown },
) {
  if (!access) return false;
  if (access.name === "ADMINPRO" && access.isPlatformOwner) return true;
  if (
    access.name !== "ADMIN" ||
    target.name === "ADMINPRO" ||
    !hasPermission(access.name, access.permissions, "settings", "manage")
  )
    return false;
  return Object.entries(parseRolePermissions(target.permissions)).every(([module, actions]) =>
    Object.entries(actions).every(
      ([action, enabled]) =>
        !enabled || hasPermission(access.name, access.permissions, module, action),
    ),
  );
}
