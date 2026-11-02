import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES } from "@/lib/warehouse";
import { PRODUCT_UNITS } from "@/lib/product-form";
import { useAppAccess, isAdminRole } from "@/lib/permissions";

const DEFAULT_PARAMETERS = [
  ...CATEGORIES.map((label) => ({
    id: `default-category-${label}`,
    kind: "category",
    label,
    active: true,
  })),
  ...PRODUCT_UNITS.map((label) => ({
    id: `default-unit-${label}`,
    kind: "unit",
    label,
    active: true,
  })),
];
function useSpecialProductParameters() {
  return useQuery({
    queryKey: ["special-product-parameters"],
    initialData: DEFAULT_PARAMETERS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("special_product_parameters")
        .select("*")
        .order("label");
      if (error) throw error;
      return data;
    },
  });
}
export function SpecialProductParameterSelect({
  kind,
  value,
  onChange,
  disabled = false,
}: {
  kind: "category" | "unit";
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const access = useAppAccess();
  const admin = isAdminRole(access?.name);
  const queryClient = useQueryClient();
  const { data: parameters, isError, isFetching } = useSpecialProductParameters();
  const options = parameters.filter((p) => p.kind === kind && p.active);
  const selected = options.find((p) => p.label === value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const label = kind === "category" ? "Categoría" : "Unidad de medida";
  const noun = kind === "category" ? "categoría" : "unidad de medida";
  async function changeParameter(action: "add" | "rename" | "disable") {
    if (!admin || busy) return;
    const clean = draft.trim();
    if (action !== "disable" && !clean) {
      toast.error("Escribe el nombre de la opción");
      return;
    }
    if (action !== "add" && (!selected || selected.id.startsWith("default-"))) return;
    setBusy(true);
    try {
      const query =
        action === "add"
          ? supabase.from("special_product_parameters").insert({ kind, label: clean })
          : supabase
              .from("special_product_parameters")
              .update(action === "rename" ? { label: clean } : { active: false })
              .eq("id", selected!.id);
      const { data, error } = await query.select("*").single();
      if (error) throw error;
      // Los productos existentes conservan su categoría/unidad histórica al renombrar opciones.
      queryClient.setQueryData<typeof parameters>(["special-product-parameters"], (old) =>
        action === "add"
          ? [...(old ?? []), data]
          : (old ?? []).map((p) => (p.id === data.id ? data : p)),
      );
      onChange(action === "disable" ? "" : data.label);
      setEditing(false);
      setDraft("");
      toast.success(action === "disable" ? "Opción desactivada" : "Parámetro guardado");
    } catch (error) {
      toast.error(
        typeof error === "object" && error && "message" in error
          ? String(error.message)
          : "No se pudo guardar la opción",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="label">{label} *</span>
        <select
          className="input"
          required
          value={selected ? value : ""}
          disabled={disabled || busy || isError}
          onChange={(e) => {
            onChange(e.target.value);
            setEditing(false);
          }}
        >
          <option value="">Selecciona {noun}…</option>
          {options.map((option) => (
            <option key={option.id} value={option.label}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {isError && (
        <p role="alert" className="text-sm text-destructive">
          No se pudieron cargar las opciones. Vuelve a abrir el formulario.
        </p>
      )}
      {admin && (
        <button
          type="button"
          className="btn btn-ghost text-sm"
          disabled={disabled || busy || isError || isFetching}
          onClick={() => {
            setEditing(!editing);
            setDraft(value);
          }}
        >
          Administrar {noun}
        </button>
      )}
      {admin && editing && (
        <div className="space-y-2 rounded border p-3">
          <label className="block">
            <span className="label">Nombre de {noun}</span>
            <input
              className="input"
              value={draft}
              maxLength={80}
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || !draft.trim()}
              onClick={() => changeParameter("add")}
            >
              Agregar opción
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || !selected || !draft.trim()}
              onClick={() => changeParameter("rename")}
            >
              Guardar cambio
            </button>
            <button
              type="button"
              className="btn btn-ghost text-destructive"
              disabled={busy || !selected}
              onClick={() => changeParameter("disable")}
            >
              Desactivar opción
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Los cambios se comparten con todos los usuarios. Los registros anteriores conservan sus
            valores.
          </p>
        </div>
      )}
    </div>
  );
}
