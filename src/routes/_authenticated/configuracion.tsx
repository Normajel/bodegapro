import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pencil, Plus, Save, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import type { Json, Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { createManagedUser, updateManagedUser } from "@/lib/user-admin.functions";
import { resetBusinessData } from "@/lib/data-reset.functions";
import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  parseRolePermissions,
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
type Tab = "users" | "roles";

const emptyPermissions: RolePermissions = {};

function ConfiguracionPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("users");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [roleName, setRoleName] = useState("");
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>(emptyPermissions);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newUserRoleId, setNewUserRoleId] = useState("");
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [editFullName, setEditFullName] = useState("");
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
        .select("id, full_name, email, role_id, created_at, app_roles(name)")
        .order("created_at");
      if (error) throw error;
      return data as Profile[];
    },
  });

  const selectedRole = roles.find((role) => role.id === selectedRoleId);
  const selectableRoles = useMemo(() => roles.filter((role) => role.name !== "ADMIN"), [roles]);

  function startNewRole() {
    setSelectedRoleId("");
    setEditingRoleId(null);
    setRoleName("");
    setRolePermissions({});
  }

  function startEditRole(role: Role) {
    setEditingRoleId(role.id);
    setRoleName(role.name);
    setRolePermissions(parseRolePermissions(role.permissions));
  }

  function setPermission(module: string, action: string, enabled: boolean) {
    setRolePermissions((current) => ({
      ...current,
      [module]: {
        ...current[module],
        [action]: enabled,
        ...(action === "view" && !enabled
          ? { create: false, edit: false, delete: false }
          : action !== "view" && enabled
            ? { view: true }
            : {}),
      },
    }));
  }

  async function saveRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = roleName.trim().toLocaleUpperCase("es-CL");
    if (!normalizedName) {
      toast.error("Escribe el nombre del perfil");
      return;
    }
    if (normalizedName === "ADMIN") {
      toast.error("El perfil ADMIN está reservado y siempre conserva todos los permisos");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: normalizedName,
        permissions: rolePermissions as Json,
      };
      const result = editingRoleId
        ? await supabase.from("app_roles").update(payload).eq("id", editingRoleId)
        : await supabase.from("app_roles").insert(payload);
      if (result.error) throw result.error;
      toast.success(editingRoleId ? "Perfil actualizado" : "Perfil creado");
      setEditingRoleId(null);
      setRoleName("");
      setRolePermissions({});
      await queryClient.invalidateQueries({ queryKey: ["app-roles"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el perfil");
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
    if (editingRoleId === role.id) startNewRole();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["app-roles"] }),
      queryClient.invalidateQueries({ queryKey: ["managed-profiles"] }),
    ]);
  }

  function openEditUser(profile: Profile) {
    setEditingUser(profile);
    setEditFullName(profile.full_name ?? "");
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
          email: editEmail.trim(),
          fullName: editFullName.trim(),
          ...(editPassword ? { password: editPassword } : {}),
          ...(editingUser.app_roles?.name === "ADMIN" ? {} : { roleId: editRoleId }),
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
          email: email.trim(),
          fullName: fullName.trim(),
          password,
          roleId: newUserRoleId,
        },
      });
      toast.success("Usuario creado. Entrégale la contraseña temporal de forma segura.");
      setFullName("");
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
          Perfiles y permisos
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
                  <label className="label" htmlFor="user-email">
                    Correo electrónico
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
                    minLength={10}
                    autoComplete="new-password"
                    required
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Mínimo 10 caracteres.</p>
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
                    {selectableRoles.map((role) => (
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
                  <th>Correo</th>
                  <th>Perfil asignado</th>
                  <th className="w-20 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {profilesLoading ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted-foreground">
                      Cargando usuarios…
                    </td>
                  </tr>
                ) : profilesError ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-destructive">
                      No se pudieron cargar los usuarios.
                    </td>
                  </tr>
                ) : profiles.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted-foreground">
                      No hay usuarios.
                    </td>
                  </tr>
                ) : (
                  profiles.map((profile) => (
                    <tr key={profile.id}>
                      <td>{profile.full_name || "—"}</td>
                      <td>{profile.email || "—"}</td>
                      <td>
                        <span
                          className={`badge ${profile.app_roles?.name === "ADMIN" ? "badge-success" : "badge-muted"}`}
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
                    <label className="label" htmlFor="edit-user-email">
                      Correo electrónico
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
                      minLength={10}
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
                    {editingUser.app_roles?.name === "ADMIN" ? (
                      <p className="input bg-muted">ADMIN (protegido)</p>
                    ) : (
                      <select
                        id="edit-user-role"
                        className="input"
                        value={editRoleId}
                        onChange={(event) => setEditRoleId(event.target.value)}
                        required
                      >
                        <option value="">Selecciona un perfil…</option>
                        {selectableRoles.map((role) => (
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
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b p-4">
              <h2 className="font-semibold">Perfiles disponibles</h2>
              <button className="btn btn-secondary" type="button" onClick={startNewRole}>
                <Plus className="h-4 w-4" /> Nuevo perfil
              </button>
            </div>
            {rolesLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Cargando perfiles…</p>
            ) : rolesError ? (
              <p className="p-4 text-sm text-destructive">No se pudieron cargar los perfiles.</p>
            ) : (
              <ul className="divide-y">
                {roles.map((role) => (
                  <li key={role.id} className="flex items-center justify-between gap-2 p-3">
                    <button
                      type="button"
                      className="flex-1 text-left"
                      onClick={() => {
                        setSelectedRoleId(role.id);
                        startEditRole(role);
                      }}
                    >
                      <span className="font-medium">{role.name}</span>
                      {role.is_system && (
                        <span className="ml-2 text-xs text-muted-foreground">Predeterminado</span>
                      )}
                    </button>
                    {role.name !== "ADMIN" && !role.is_system && (
                      <button
                        type="button"
                        className="btn btn-ghost p-1.5 text-destructive"
                        aria-label={`Eliminar perfil ${role.name}`}
                        onClick={() => void deleteRole(role)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <form onSubmit={saveRole} className="card space-y-4 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">
                {editingRoleId ? "Editar permisos" : "Nuevo perfil"}
              </h2>
              {editingRoleId && (
                <button
                  type="button"
                  className="btn btn-ghost p-1.5"
                  aria-label="Nuevo perfil"
                  onClick={startNewRole}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div>
              <label className="label" htmlFor="role-name">
                Nombre del perfil
              </label>
              <input
                id="role-name"
                className="input"
                value={roleName}
                onChange={(event) => setRoleName(event.target.value)}
                maxLength={60}
                disabled={selectedRole?.name === "ADMIN"}
                required
              />
            </div>
            {selectedRole?.name === "ADMIN" ? (
              <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                ADMIN siempre conserva acceso total y no se puede modificar.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Selecciona qué puede ver y qué acciones puede realizar este perfil.
                </p>
                <div className="overflow-x-auto rounded-md border">
                  <table className="table-base min-w-[480px]">
                    <thead>
                      <tr>
                        <th>Sección</th>
                        {PERMISSION_ACTIONS.map((action) => (
                          <th key={action.key}>{action.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {PERMISSION_MODULES.map((module) => (
                        <tr key={module.key}>
                          <td className="font-medium">{module.label}</td>
                          {PERMISSION_ACTIONS.map((action) => {
                            const available = (module.actions as readonly string[]).includes(
                              action.key,
                            );
                            return (
                              <td key={action.key}>
                                {available ? (
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-primary"
                                    checked={rolePermissions[module.key]?.[action.key] === true}
                                    onChange={(event) =>
                                      setPermission(module.key, action.key, event.target.checked)
                                    }
                                    aria-label={`${action.label} ${module.label}`}
                                  />
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  El acceso a Configuración y administración de usuarios está reservado a ADMIN.
                </p>
              </>
            )}
            <button
              className="btn btn-primary"
              type="submit"
              disabled={saving || selectedRole?.name === "ADMIN"}
            >
              <Save className="h-4 w-4" /> {saving ? "Guardando…" : "Guardar perfil"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
