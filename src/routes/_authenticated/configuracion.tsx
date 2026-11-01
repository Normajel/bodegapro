import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Building2, Pencil, Plus, Save, Trash2, Users, X } from "lucide-react";
import { CompanySettingsForm } from "@/components/company-settings-form";
import { toast } from "sonner";
import type { Json, Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { createManagedUser, updateManagedUser } from "@/lib/user-admin.functions";
import { resetBusinessData } from "@/lib/data-reset.functions";
import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  isAdminRole,
  useAppAccess,
  parseRolePermissions,
  effectiveRolePermission,
  canEditRolePermission,
  updateRolePermission,
  type RolePermissions,
} from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración — BodegaPro" },
      { name: "description", content: "Gestiona los usuarios y permisos de BodegaPro." },
    ],
  }),
  component: ConfiguracionPage,
});

type Role = Tables<"app_roles">;
type Profile = Tables<"profiles"> & {
  app_roles: { name: string } | null;
};
type Tab = "users" | "roles" | "company";

const emptyPermissions: RolePermissions = {};

function ConfiguracionPage() {
  const queryClient = useQueryClient();
  const access = useAppAccess();
  const canAssignAdmin = access?.isPlatformOwner === true && access.name === "ADMINPRO";
  const [tab, setTab] = useState<Tab>("users");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>(emptyPermissions);
  const [fullName, setFullName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newUserRoleId, setNewUserRoleId] = useState("");
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRoleId, setEditRoleId] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [ownerCode, setOwnerCode] = useState("");
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [saving, setSaving] = useState(false);

  const {
    data: roles = [],
    isLoading: rolesLoading,
    isError: rolesError,
  } = useQuery({
    queryKey: ["app-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_roles").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const {
    data: profiles = [],
    isLoading: profilesLoading,
    isError: profilesError,
  } = useQuery({
    queryKey: ["managed-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, username, role_id, created_at, app_roles(name)")
        .order("created_at");
      if (error) throw error;
      return data as Profile[];
    },
  });

  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? roles[0];
  useEffect(() => {
    setRolePermissions(parseRolePermissions(selectedRole?.permissions));
  }, [selectedRole]);
  const assignableUserRoles = useMemo(
    () =>
      roles.filter((role) => !isAdminRole(role.name) || (role.name === "ADMIN" && canAssignAdmin)),
    [roles, canAssignAdmin],
  );

  function setPermission(module: string, action: string, enabled: boolean) {
    if (!selectedRole || !canEditRolePermission(selectedRole.name, module, action)) return;
    setRolePermissions((current) => updateRolePermission(current, module, action, enabled));
  }

  async function saveRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRole || isAdminRole(selectedRole.name)) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("app_roles")
        .update({ permissions: rolePermissions as Json })
        .eq("id", selectedRole.id)
        .select("id")
        .single();
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app-roles"] }),
        queryClient.invalidateQueries({ queryKey: ["current-user-access"] }),
      ]);
      toast.success("Permisos guardados");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron guardar los permisos");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole(role: Role) {
    if (role.is_system) {
      toast.error("Los perfiles predeterminados no se pueden eliminar");
      return;
    }
    if (!window.confirm(`¿Eliminar el perfil "${role.name}"?`)) return;
    const { error } = await supabase.from("app_roles").delete().eq("id", role.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Perfil eliminado");
    if (selectedRoleId === role.id) setSelectedRoleId("");
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["app-roles"] }),
      queryClient.invalidateQueries({ queryKey: ["managed-profiles"] }),
    ]);
  }

  function openEditUser(profile: Profile) {
    setEditingUser(profile);
    setEditFullName(profile.full_name ?? "");
    setEditUsername(profile.username ?? "");
    setEditEmail(profile.email ?? "");
    setEditPassword("");
    setEditRoleId(profile.role_id ?? "");
  }

  function closeEditUser() {
    setEditingUser(null);
    setEditPassword("");
  }

  async function saveUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUser) return;

    setSaving(true);
    try {
      const result = await updateManagedUser({
        data: {
          userId: editingUser.id,
          username: editUsername.trim(),
          email: editEmail.trim(),
          fullName: editFullName.trim(),
          ...(editPassword ? { password: editPassword } : {}),
          ...(isAdminRole(editingUser.app_roles?.name) ? {} : { roleId: editRoleId }),
        },
      });
      toast.success(
        result.passwordUpdated
          ? "Usuario actualizado. Entrégale la nueva contraseña temporal de forma segura."
          : "Usuario actualizado correctamente",
      );
      closeEditUser();
      await queryClient.invalidateQueries({ queryKey: ["managed-profiles"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el usuario");
    } finally {
      setSaving(false);
    }
  }

  async function addUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newUserRoleId) {
      toast.error("Selecciona un perfil para el nuevo usuario");
      return;
    }

    setSaving(true);
    try {
      await createManagedUser({
        data: {
          username: newUsername.trim(),
          email: email.trim(),
          fullName: fullName.trim(),
          password,
          roleId: newUserRoleId,
        },
      });
      toast.success("Usuario creado. Entrégale la contraseña temporal de forma segura.");
      setFullName("");
      setNewUsername("");
      setEmail("");
      setPassword("");
      await queryClient.invalidateQueries({ queryKey: ["managed-profiles"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear el usuario");
    } finally {
      setSaving(false);
    }
  }

  function closeReset() {
    setResetOpen(false);
    setOwnerCode("");
    setResetConfirmation("");
  }

  async function handleResetBusinessData(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (resetConfirmation !== "REINICIAR") {
      toast.error('Escribe "REINICIAR" para confirmar el borrado');
      return;
    }

    setSaving(true);
    try {
      await resetBusinessData({ data: { ownerCode } });
      closeReset();
      await queryClient.invalidateQueries();
      toast.success("Datos de la empresa reiniciados. Los usuarios y perfiles se conservaron.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron reiniciar los datos");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Crea usuarios y decide qué secciones y acciones puede usar cada perfil.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className={`btn ${tab === "users" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setTab("users")}
        >
          <Users className="h-4 w-4" /> Usuarios
        </button>
        <button
          className={`btn ${tab === "roles" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setTab("roles")}
        >
          Roles y permisos
        </button>
        <button
          className={`btn ${tab === "company" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setTab("company")}
        >
          <Building2 className="h-4 w-4" /> Empresa
        </button>
      </div>

      {tab === "users" ? (
        <div className="space-y-5">
          <form onSubmit={addUser} className="card space-y-4 p-4">
            <h2 className="font-semibold">Crear usuario</h2>
            {rolesError ? (
              <p className="text-sm text-destructive">No se pudieron cargar los perfiles.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="user-full-name">
                    Nombre
                  </label>
                  <input
                    id="user-full-name"
                    className="input"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    maxLength={120}
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="user-username">
                    Usuario
                  </label>
                  <input
                    id="user-username"
                    className="input"
                    value={newUsername}
                    onChange={(event) => setNewUsername(event.target.value.toLowerCase())}
                    maxLength={32}
                    pattern="[a-z0-9][a-z0-9_.\-]{2,31}"
                    title="3 a 32 caracteres: letras minúsculas, números, _ . -"
                    autoCapitalize="none"
                    placeholder="bodega_1"
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="user-email">
                    Correo (solo recuperación y autenticación)
                  </label>
                  <input
                    id="user-email"
                    type="email"
                    className="input"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    maxLength={254}
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="user-password">
                    Contraseña temporal
                  </label>
                  <input
                    id="user-password"
                    type="password"
                    className="input"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={12}
                    autoComplete="new-password"
                    required
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Mínimo 12 caracteres. Usa una contraseña única, idealmente generada por un
                    administrador de contraseñas.
                  </p>
                </div>
                <div>
                  <label className="label" htmlFor="user-role">
                    Perfil
                  </label>
                  <select
                    id="user-role"
                    className="input"
                    value={newUserRoleId}
                    onChange={(event) => setNewUserRoleId(event.target.value)}
                    required
                    disabled={rolesLoading}
                  >
                    <option value="">Selecciona un perfil…</option>
                    {assignableUserRoles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <button className="btn btn-primary" type="submit" disabled={saving || rolesLoading}>
              <Plus className="h-4 w-4" /> {saving ? "Creando…" : "Crear usuario"}
            </button>
          </form>

          <section className="card overflow-x-auto">
            <div className="border-b p-4">
              <h2 className="font-semibold">Usuarios registrados</h2>
            </div>
            <table className="table-base min-w-[650px]">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Usuario</th>
                  <th>Correo</th>
                  <th>Perfil asignado</th>
                  <th className="w-20 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {profilesLoading ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      Cargando usuarios…
                    </td>
                  </tr>
                ) : profilesError ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-destructive">
                      No se pudieron cargar los usuarios.
                    </td>
                  </tr>
                ) : profiles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      No hay usuarios.
                    </td>
                  </tr>
                ) : (
                  profiles.map((profile) => (
                    <tr key={profile.id}>
                      <td>{profile.full_name || "—"}</td>
                      <td className="font-mono">{profile.username || "—"}</td>
                      <td>{profile.email || "—"}</td>
                      <td>
                        <span
                          className={`badge ${isAdminRole(profile.app_roles?.name) ? "badge-success" : "badge-muted"}`}
                        >
                          {profile.app_roles?.name || "Sin perfil"}
                        </span>
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="btn btn-ghost p-1.5"
                          aria-label={`Editar usuario ${profile.full_name || profile.email || ""}`}
                          title="Editar usuario"
                          disabled={profile.app_roles?.name === "ADMINPRO" && !canAssignAdmin}
                          onClick={() => openEditUser(profile)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
          <section className="card space-y-3 border-destructive/40 p-4">
            <div>
              <h2 className="font-semibold text-destructive">Reiniciar datos de la empresa</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Elimina productos, contactos, compras, movimientos e historial operativo. Conserva
                las cuentas de usuario, los perfiles y sus permisos. Esta acción no se puede
                deshacer.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary text-destructive"
              onClick={() => setResetOpen(true)}
            >
              <Trash2 className="h-4 w-4" /> Reiniciar datos…
            </button>
          </section>
          {editingUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-foreground/40 p-4">
              <form onSubmit={saveUser} className="card w-full max-w-xl space-y-4 p-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold">Editar usuario</h2>
                  <button
                    type="button"
                    className="btn btn-ghost p-1.5"
                    onClick={closeEditUser}
                    disabled={saving}
                    aria-label="Cerrar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="edit-user-name">
                      Nombre
                    </label>
                    <input
                      id="edit-user-name"
                      className="input"
                      value={editFullName}
                      onChange={(event) => setEditFullName(event.target.value)}
                      maxLength={120}
                      required
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="edit-user-username">
                      Usuario
                    </label>
                    <input
                      id="edit-user-username"
                      className="input"
                      value={editUsername}
                      onChange={(event) => setEditUsername(event.target.value.toLowerCase())}
                      maxLength={32}
                      pattern="[a-z0-9][a-z0-9_.\-]{2,31}"
                      title="3 a 32 caracteres: letras minúsculas, números, _ . -"
                      autoCapitalize="none"
                      required
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="edit-user-email">
                      Correo (solo recuperación y autenticación)
                    </label>
                    <input
                      id="edit-user-email"
                      type="email"
                      className="input"
                      value={editEmail}
                      onChange={(event) => setEditEmail(event.target.value)}
                      maxLength={254}
                      required
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="edit-user-password">
                      Nueva contraseña temporal
                    </label>
                    <input
                      id="edit-user-password"
                      type="password"
                      className="input"
                      value={editPassword}
                      onChange={(event) => setEditPassword(event.target.value)}
                      minLength={12}
                      maxLength={128}
                      autoComplete="new-password"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Déjala vacía para conservar la contraseña actual.
                    </p>
                  </div>
                  <div>
                    <label className="label" htmlFor="edit-user-role">
                      Perfil
                    </label>
                    {isAdminRole(editingUser.app_roles?.name) ? (
                      <p className="input bg-muted">{editingUser.app_roles?.name} (protegido)</p>
                    ) : (
                      <select
                        id="edit-user-role"
                        className="input"
                        value={editRoleId}
                        onChange={(event) => setEditRoleId(event.target.value)}
                        required
                      >
                        <option value="">Selecciona un perfil…</option>
                        {assignableUserRoles.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={closeEditUser}
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    <Save className="h-4 w-4" />
                    {saving ? "Guardando…" : "Guardar cambios"}
                  </button>
                </div>
              </form>
            </div>
          )}
          {resetOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-foreground/40 p-4">
              <form
                onSubmit={handleResetBusinessData}
                className="card w-full max-w-lg space-y-4 p-6"
              >
                <div>
                  <h2 className="font-display text-lg font-bold text-destructive">
                    Confirmar reinicio completo
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Se borrarán permanentemente todos los productos, contactos, órdenes de compra,
                    compras y movimientos. Los usuarios y sus perfiles se mantendrán.
                  </p>
                </div>
                <div>
                  <label className="label" htmlFor="owner-reset-code">
                    Código privado (20+ caracteres)
                  </label>
                  <input
                    id="owner-reset-code"
                    type="password"
                    className="input"
                    value={ownerCode}
                    onChange={(event) => setOwnerCode(event.target.value)}
                    autoComplete="off"
                    minLength={20}
                    maxLength={256}
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="reset-confirmation">
                    Escribe REINICIAR para confirmar
                  </label>
                  <input
                    id="reset-confirmation"
                    className="input"
                    value={resetConfirmation}
                    onChange={(event) => setResetConfirmation(event.target.value)}
                    autoComplete="off"
                    required
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={closeReset}
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={saving || ownerCode.length < 20 || resetConfirmation !== "REINICIAR"}
                  >
                    <Trash2 className="h-4 w-4" />
                    {saving ? "Reiniciando…" : "Borrar datos"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      ) : tab === "company" ? (
        <CompanySettingsForm />
      ) : (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Roles y permisos</h2>
            <p className="text-sm text-muted-foreground">
              Selecciona un perfil para consultar sus permisos actuales o modificarlos.
            </p>
          </div>
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)]">
            <section className="card overflow-hidden" aria-label="Perfiles disponibles">
              {rolesLoading ? (
                <p className="p-4 text-sm text-muted-foreground">Cargando perfiles…</p>
              ) : rolesError ? (
                <p className="p-4 text-sm text-destructive">No se pudieron cargar los perfiles.</p>
              ) : (
                <ul className="divide-y">
                  {roles.map((role) => {
                    const allowed = PERMISSION_MODULES.flatMap((module) =>
                      module.actions.map((action) =>
                        effectiveRolePermission(role.name, role.permissions, module.key, action),
                      ),
                    ).filter(Boolean).length;
                    return (
                      <li
                        key={role.id}
                        className={`flex items-center gap-2 p-3 ${selectedRole?.id === role.id ? "bg-primary/10" : ""}`}
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 space-y-1 text-left"
                          disabled={saving}
                          aria-pressed={selectedRole?.id === role.id}
                          onClick={() => setSelectedRoleId(role.id)}
                        >
                          <span className="block font-semibold">{role.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {allowed} permisos activos ·{" "}
                            {isAdminRole(role.name) ? "Protegido" : "Editable"}
                          </span>
                        </button>
                        {!role.is_system && !isAdminRole(role.name) && (
                          <button
                            type="button"
                            className="btn btn-ghost p-1.5 text-destructive"
                            disabled={saving}
                            aria-label={`Eliminar perfil ${role.name}`}
                            onClick={() => void deleteRole(role)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            {selectedRole && !rolesError && (
              <form onSubmit={saveRole} className="card min-w-0 space-y-4 p-4">
                <div>
                  <h3 className="font-semibold">Permisos de {selectedRole.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {isAdminRole(selectedRole.name)
                      ? "Perfil protegido. Sus permisos se muestran para consulta."
                      : "Marca las acciones permitidas y guarda los cambios."}
                  </p>
                </div>
                <div className="space-y-3">
                  {PERMISSION_MODULES.map((module) => (
                    <fieldset key={module.key} className="rounded-lg border p-3" disabled={saving}>
                      <legend className="px-1 text-sm font-semibold">{module.label}</legend>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {module.actions.map((action) => {
                          const editable = canEditRolePermission(
                            selectedRole.name,
                            module.key,
                            action,
                          );
                          const checked = effectiveRolePermission(
                            selectedRole.name,
                            rolePermissions,
                            module.key,
                            action,
                          );
                          const actionLabel =
                            action === "delete" && ["purchases", "movements"].includes(module.key)
                              ? "Anular"
                              : action === "delete" && module.key === "inventory"
                                ? "Archivar productos"
                                : (PERMISSION_ACTIONS.find((a) => a.key === action)?.label ??
                                  action);
                          return (
                            <label
                              key={action}
                              className={`flex items-center gap-2 text-sm ${editable ? "" : "text-muted-foreground"}`}
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 shrink-0 accent-primary"
                                checked={checked}
                                disabled={!editable || saving}
                                onChange={(event) =>
                                  setPermission(module.key, action, event.target.checked)
                                }
                                aria-label={`${actionLabel}: ${module.label}, ${selectedRole.name}`}
                              />
                              <span>
                                {actionLabel}
                                {!editable && <span className="ml-1 text-xs">(protegido)</span>}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {module.key === "purchases" && (
                        <p className="mt-3 text-xs text-muted-foreground">
                          Aprobar está disponible para Gerencia y administradores; recibir, para
                          Bodega y administradores. Recibir requiere registrar movimientos; enviar
                          requiere editar compras. Los servicios comparten los permisos de consulta
                          de compras.
                        </p>
                      )}
                      {module.key === "settings" && (
                        <p className="mt-3 text-xs text-muted-foreground">
                          Reservado a ADMIN y ADMINPRO con segundo factor. Asignar ADMIN requiere al
                          propietario ADMINPRO.
                        </p>
                      )}
                      {module.key === "platform" && (
                        <p className="mt-3 text-xs text-muted-foreground">
                          Exclusivo del propietario ADMINPRO. La configuración de correo exige
                          segundo factor.
                        </p>
                      )}
                      {module.key === "movements" && (
                        <p className="mt-3 text-xs text-muted-foreground">
                          La recepción de productos se registra desde una orden de compra aprobada.
                        </p>
                      )}
                    </fieldset>
                  ))}
                </div>
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <strong>Servicios aceptados:</strong>{" "}
                  {effectiveRolePermission(selectedRole.name, rolePermissions, "purchases", "view")
                    ? "Puede consultar"
                    : "Sin acceso"}
                  . El acceso a Servicios se modifica con «Ver» en Órdenes de compra y servicios.
                </div>
                {!isAdminRole(selectedRole.name) && (
                  <button className="btn btn-primary" type="submit" disabled={saving}>
                    <Save className="h-4 w-4" />
                    {saving ? "Guardando…" : "Guardar permisos"}
                  </button>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
