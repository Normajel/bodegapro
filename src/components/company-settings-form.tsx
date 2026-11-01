import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
};

export function CompanySettingsForm() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);

  const { data, isLoading, isError } = useQuery({
    queryKey: COMPANY_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("name, rut, business_activity, address, phone, email, billing_email")
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
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("company_settings").upsert({
        id: true,
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
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Datos de la empresa guardados");
      queryClient.invalidateQueries({ queryKey: COMPANY_QUERY_KEY });
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
          No se pudieron cargar los datos. ¿Aplicaste la migración 0021?
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
          <label className="label">Correo</label>
          <input
            type="email"
            className="input"
            value={form.email}
            onChange={set("email")}
            maxLength={200}
          />
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
      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary" disabled={save.isPending || isLoading}>
          <Save className="h-4 w-4" />
          {save.isPending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
