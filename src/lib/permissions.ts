import { createContext, useContext } from "react";

export const PERMISSION_MODULES = [
  { key: "dashboard", label: "Panel", actions: ["view"] },
  { key: "inventory", label: "Inventario", actions: ["view", "create", "edit", "delete"] },
  { key: "movements", label: "Movimientos", actions: ["view", "create", "edit", "delete"] },
  { key: "purchases", label: "Compras", actions: ["view", "create", "edit", "delete"] },
  { key: "contacts", label: "Contactos", actions: ["view", "create", "edit", "delete"] },
  { key: "reports", label: "Informes", actions: ["view"] },
] as const;

export const PERMISSION_ACTIONS = [
  { key: "view", label: "Ver" },
  { key: "create", label: "Crear" },
  { key: "edit", label: "Editar" },
  { key: "delete", label: "Eliminar" },
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number]["key"];
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number]["key"];
export type RolePermissions = Record<string, Record<string, boolean>>;
export type CurrentAccess = {
  name: string;
  permissions: unknown;
};

export const AppAccessContext = createContext<CurrentAccess | null>(null);

export function useAppAccess() {
  return useContext(AppAccessContext);
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
  if (roleName === "ADMIN") return true;
  return parseRolePermissions(permissions)[module]?.[action] === true;
}
