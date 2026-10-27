import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, Shield, SlidersHorizontal, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createSeparateAdminProAccount } from "@/lib/user-admin.functions";

export const Route = createFileRoute("/_authenticated/adminpro")({
  beforeLoad: async () => {
    const { data, error } = await supabase.rpc("is_platform_owner");
    if (error) throw error;
    if (!data) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Panel ADMINPRO — BodegaPro" },
      { name: "description", content: "Administración interna de la plataforma BodegaPro." },
    ],
  }),
  component: AdminProPage,
});

function AdminProPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [savingModule, setSavingModule] = useState<string | null>(null);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminUsername, setNewAdminUsername] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [newAdminPasswordConfirmation, setNewAdminPasswordConfirmation] = useState("");

  const {
    data: menuSettings = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["platform-menu-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_menu_settings")
        .select("module_key, label, enabled")
        .order("label");
      if (error) throw error;
      return data;
    },
  });

  async function updateMenu(moduleKey: string, enabled: boolean) {
    setSavingModule(moduleKey);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("No se encontró la sesión activa");

      const { error } = await supabase
        .from("platform_menu_settings")
        .update({
          enabled,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        })
        .eq("module_key", moduleKey);
      if (error) throw error;

      toast.success(`Menú ${enabled ? "activado" : "desactivado"}`);
      await queryClient.invalidateQueries({ queryKey: ["platform-menu-settings"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el menú");
    } finally {
      setSavingModule(null);
    }
  }

  async function createSeparateAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newAdminPassword !== newAdminPasswordConfirmation) {
      toast.error("Las contraseñas no coinciden");
      return;
    }

    setCreatingAccount(true);
    try {
      await createSeparateAdminProAccount({
        data: {
          fullName: newAdminName.trim(),
          username: newAdminUsername.trim(),
          email: newAdminEmail.trim(),
          password: newAdminPassword,
        },
      });

      toast.success("Cuenta ADMINPRO creada. La cuenta actual quedará como ADMIN.");
      setNewAdminPassword("");
      setNewAdminPasswordConfirmation("");
      queryClient.clear();
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast.error(
          "La cuenta fue creada, pero no se pudo cerrar esta sesión. Cierra sesión manualmente.",
        );
      } else {
        toast.success("Sesión cerrada. Ingresa ahora con el usuario ADMINPRO nuevo.");
      }
      await navigate({ to: "/auth", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear la cuenta ADMINPRO");
    } finally {
      setCreatingAccount(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Shield className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Panel ADMINPRO</h1>
          <p className="text-sm text-muted-foreground">
            Espacio privado de administración de la plataforma.
          </p>
        </div>
      </header>

      <section className="card space-y-4 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <SlidersHorizontal className="mt-1 h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold">Menús del sistema</h2>
            <p className="text-sm text-muted-foreground">
              Activa o desactiva secciones para esta instalación. El alcance por empresa se
              configurará cuando se incorpore la administración multiempresa.
            </p>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando menús…</p>
        ) : isError ? (
          <p className="text-sm text-destructive">
            No se pudo cargar la configuración de menús. Verifica que la migración 0031 esté
            aplicada.
          </p>
        ) : menuSettings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay menús configurados.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {menuSettings.map((setting) => (
              <li key={setting.module_key} className="flex items-center justify-between gap-4 p-3">
                <div>
                  <p className="font-medium">{setting.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {setting.enabled ? "Disponible en el menú" : "Oculto para los usuarios"}
                  </p>
                </div>
                <label className="flex shrink-0 items-center gap-2 text-sm">
                  <span>{setting.enabled ? "Activo" : "Inactivo"}</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={setting.enabled}
                    disabled={savingModule !== null}
                    aria-label={`${setting.enabled ? "Desactivar" : "Activar"} menú ${setting.label}`}
                    onChange={(event) => void updateMenu(setting.module_key, event.target.checked)}
                  />
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-4 p-4 sm:p-6">
        <div>
          <h2 className="font-semibold">Separar la cuenta ADMINPRO</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea un usuario y una contraseña exclusivos para la administración de la plataforma. Al
            finalizar, esta cuenta volverá a ser ADMIN y se cerrará la sesión para que ingreses con
            las nuevas credenciales.
          </p>
        </div>
        <form onSubmit={createSeparateAccount} className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="adminpro-full-name">
              Nombre
            </label>
            <input
              id="adminpro-full-name"
              className="input"
              value={newAdminName}
              onChange={(event) => setNewAdminName(event.target.value)}
              maxLength={120}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="adminpro-username">
              Usuario ADMINPRO
            </label>
            <input
              id="adminpro-username"
              className="input"
              value={newAdminUsername}
              onChange={(event) => setNewAdminUsername(event.target.value.toLowerCase())}
              pattern="[a-z0-9][a-z0-9_.-]{2,31}"
              title="3 a 32 caracteres: letras minúsculas, números, _ . -"
              maxLength={32}
              autoCapitalize="none"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="adminpro-email">
              Correo de recuperación
            </label>
            <input
              id="adminpro-email"
              type="email"
              className="input"
              value={newAdminEmail}
              onChange={(event) => setNewAdminEmail(event.target.value)}
              maxLength={254}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="adminpro-password">
              Contraseña nueva
            </label>
            <input
              id="adminpro-password"
              type="password"
              className="input"
              value={newAdminPassword}
              onChange={(event) => setNewAdminPassword(event.target.value)}
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="adminpro-password-confirmation">
              Repite la contraseña
            </label>
            <input
              id="adminpro-password-confirmation"
              type="password"
              className="input"
              value={newAdminPasswordConfirmation}
              onChange={(event) => setNewAdminPasswordConfirmation(event.target.value)}
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn btn-primary" disabled={creatingAccount}>
              {creatingAccount ? "Creando cuenta…" : "Crear cuenta ADMINPRO separada"}
            </button>
          </div>
        </form>
        <p className="text-xs text-muted-foreground">
          La cuenta ADMINPRO nueva deberá configurar su propio segundo factor al iniciar sesión.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card space-y-3 p-4 sm:p-6">
          <Building2 className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold">Empresas</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              La estructura actual administra una sola empresa. El registro y aislamiento de
              empresas se habilitará en una etapa posterior.
            </p>
          </div>
          <button type="button" className="btn btn-secondary" disabled>
            Próximamente
          </button>
        </section>

        <section className="card space-y-3 p-4 sm:p-6">
          <Users className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold">Administradores de empresas</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Aquí se administrarán los perfiles ADMIN de cada empresa una vez que exista el
              aislamiento multiempresa.
            </p>
          </div>
          <button type="button" className="btn btn-secondary" disabled>
            Próximamente
          </button>
        </section>
      </div>
    </div>
  );
}
