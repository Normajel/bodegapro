import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PanelIdentity } from "@/components/panel-identity";
import { usePanelLogoUrl } from "@/hooks/use-panel-branding";
import {
  PANEL_BRANDING_QUERY_KEY,
  PANEL_LOGO_BUCKET,
  preparePanelLogo,
  validatePanelName,
} from "@/lib/panel-branding";
import { formatRut, isValidRut } from "@/lib/rut";

export const COMPANY_QUERY_KEY = ["company-settings"];

const EMPTY = {
  name: "",
  rut: "",
  business_activity: "",
  address: "",
  phone: "",
  email: "",
  billing_email: "",
  panel_name: "",
  panel_logo_path: null as string | null,
};

export function CompanySettingsForm() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);
  const [preparingLogo, setPreparingLogo] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { data: savedLogoUrl } = usePanelLogoUrl(form.panel_logo_path);
  useEffect(() => {
    if (!pendingLogo) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingLogo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingLogo]);

  const { data, isLoading, isError } = useQuery({
    queryKey: [...COMPANY_QUERY_KEY, "configuration"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select(
          "name, rut, business_activity, address, phone, email, billing_email, panel_name, panel_logo_path",
        )
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (data) setForm({ ...EMPTY, ...data });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (form.rut.trim() && !isValidRut(form.rut)) throw new Error("El RUT no es válido");
      const panelName = validatePanelName(form.panel_name);
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!userData.user) throw new Error("Vuelve a iniciar sesión para guardar.");
      const oldLogoPath = data?.panel_logo_path ?? null;
      let uploadedPath: string | null = null;
      if (pendingLogo) {
        uploadedPath = `panel/${crypto.randomUUID()}.png`;
        const { error: uploadError } = await supabase.storage
          .from(PANEL_LOGO_BUCKET)
          .upload(uploadedPath, pendingLogo, { contentType: "image/png", upsert: false });
        if (uploadError) throw uploadError;
      }
      const logoPath = uploadedPath ?? form.panel_logo_path;
      const { error } = await supabase.from("company_settings").upsert({
        id: true,
        panel_name: panelName,
        panel_logo_path: logoPath,
        name: form.name.trim(),
        rut: form.rut.trim() ? formatRut(form.rut) : "",
        business_activity: form.business_activity.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        billing_email: form.billing_email.trim(),
        updated_at: new Date().toISOString(),
        updated_by: userData.user?.id ?? null,
      });
      if (error) {
        if (uploadedPath) await supabase.storage.from(PANEL_LOGO_BUCKET).remove([uploadedPath]);
        throw error;
      }
      if (oldLogoPath && oldLogoPath !== logoPath) {
        await supabase.storage.from(PANEL_LOGO_BUCKET).remove([oldLogoPath]);
      }
      return { panelName, logoPath };
    },
    onSuccess: ({ panelName, logoPath }) => {
      setForm((current) => ({ ...current, panel_name: panelName, panel_logo_path: logoPath }));
      setPendingLogo(null);
      toast.success("Datos de la empresa guardados");
      queryClient.invalidateQueries({ queryKey: COMPANY_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: PANEL_BRANDING_QUERY_KEY });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "No se pudieron guardar los datos"),
  });

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="card max-w-2xl space-y-4 p-4"
    >
      <div>
        <h2 className="font-semibold">Datos de la empresa</h2>
        <p className="text-sm text-muted-foreground">
          Se usan en el encabezado de las órdenes de compra.
        </p>
      </div>
      {isError && (
        <p className="text-sm text-destructive">
          No se pudieron cargar los datos de la empresa. Intenta actualizar la página.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Nombre de la empresa</label>
          <input className="input" value={form.name} onChange={set("name")} maxLength={200} />
        </div>
        <div>
          <label className="label">RUT</label>
          <input
            className="input"
            placeholder="76.123.456-7"
            value={form.rut}
            onChange={set("rut")}
            onBlur={() => form.rut.trim() && setForm({ ...form, rut: formatRut(form.rut) })}
            maxLength={20}
          />
        </div>
        <div>
          <label className="label">Giro</label>
          <input
            className="input"
            value={form.business_activity}
            onChange={set("business_activity")}
            maxLength={300}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Dirección</label>
          <input className="input" value={form.address} onChange={set("address")} maxLength={300} />
        </div>
        <div>
          <label className="label">Teléfono</label>
          <input className="input" value={form.phone} onChange={set("phone")} maxLength={40} />
        </div>
        <div>
          <label className="label">Correo de la empresa</label>
          <input
            type="email"
            className="input"
            value={form.email}
            onChange={set("email")}
            maxLength={200}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Aquí llegarán las respuestas de los proveedores a las órdenes enviadas por BodegaPro.
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Correo para facturación electrónica (XML)</label>
          <input
            type="email"
            className="input"
            value={form.billing_email}
            onChange={set("billing_email")}
            maxLength={200}
          />
        </div>
      </div>
      <fieldset
        disabled={save.isPending || preparingLogo || isLoading || isError}
        className="space-y-3 border-t border-border pt-4"
      >
        <legend className="font-semibold">Personalización del panel de inicio</legend>
        <p className="text-sm text-muted-foreground">
          El nombre y el logo se mostrarán únicamente en Inicio.
        </p>
        <div>
          <label className="label" htmlFor="panel-name">
            Nombre Panel
          </label>
          <input
            id="panel-name"
            className="input"
            value={form.panel_name}
            onChange={set("panel_name")}
            maxLength={20}
            placeholder="BodegaPro"
            aria-describedby="panel-name-help"
          />
          <p id="panel-name-help" className="mt-1 text-xs text-muted-foreground">
            Máximo 20 caracteres. Si lo dejas vacío, se mostrará BodegaPro.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="panel-logo">
            Logo de la empresa
          </label>
          <input
            id="panel-logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="input"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setPreparingLogo(true);
              try {
                setPendingLogo(await preparePanelLogo(file));
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "No se pudo preparar el logo");
              } finally {
                setPreparingLogo(false);
              }
            }}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            PNG, JPG o WebP, hasta 2 MB. Se ajustará a 32 × 32 píxeles sin deformarse.
          </p>
          {preparingLogo && <p className="text-sm text-muted-foreground">Preparando logo…</p>}
          {(pendingLogo || form.panel_logo_path) && (
            <button
              type="button"
              className="btn btn-ghost mt-2"
              onClick={() => {
                setPendingLogo(null);
                setForm((current) => ({ ...current, panel_logo_path: null }));
              }}
            >
              Quitar logo
            </button>
          )}
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 text-xs text-muted-foreground">Vista previa</p>
          <PanelIdentity name={form.panel_name} logoUrl={previewUrl ?? savedLogoUrl} />
        </div>
      </fieldset>
      <div className="flex justify-end">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={save.isPending || isLoading || isError || preparingLogo}
        >
          <Save className="h-4 w-4" />
          {save.isPending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
