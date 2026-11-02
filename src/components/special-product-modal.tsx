import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ProductDescriptionField } from "./product-description-field";
import { CATEGORIES } from "@/lib/warehouse";
import { PRODUCT_UNITS, type ProductDetails } from "@/lib/product-form";
import type { SpecialProduct } from "@/lib/special-products";

// Montar el formulario solo mientras está abierto reinicia sus campos al cerrar.
export function SpecialProductModal({
  open,
  onClose,
  onSaved,
  initialName = "",
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (product: SpecialProduct) => void;
  initialName?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      {open && (
        <DialogPortal>
          <DialogOverlay className="z-[80]" />
          <DialogPrimitive.Content
            className="card fixed left-1/2 top-1/2 z-[90] max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
            onEscapeKeyDown={(e) => {
              if (busy) e.preventDefault();
            }}
            onPointerDownOutside={(e) => {
              if (busy) e.preventDefault();
            }}
          >
            <DialogTitle>Nuevo producto especial</DialogTitle>
            <DialogDescription>
              Se guarda en el catálogo especial, sin stock. El SKU ESP se asigna automáticamente.
            </DialogDescription>
            <SpecialProductForm
              initialName={initialName}
              onClose={onClose}
              onSaved={onSaved}
              onBusyChange={setBusy}
            />
          </DialogPrimitive.Content>
        </DialogPortal>
      )}
    </Dialog>
  );
}
function SpecialProductForm({
  initialName,
  onClose,
  onSaved,
  onBusyChange,
}: {
  onBusyChange: (busy: boolean) => void;
  initialName: string;
  onClose: () => void;
  onSaved: (p: SpecialProduct) => void;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProductDetails>({
    name: initialName,
    category: CATEGORIES[0],
    unit: "unidad",
    supplier_id: "",
    unit_cost: 0,
    barcode: "",
    location: "",
  });
  const { data: suppliers = [], isError } = useQuery({
    queryKey: ["special-suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_directory")
        .select("id,name,supplier_kind")
        .order("name");
      if (error) throw error;
      return data.filter((s) => s.supplier_kind !== "servicios");
    },
  });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (
      !form.name.trim() ||
      !form.category.trim() ||
      !form.unit.trim() ||
      !Number.isFinite(form.unit_cost) ||
      form.unit_cost < 0
    ) {
      toast.error("Revisa descripción, categoría, unidad y costo");
      return;
    }
    setSaving(true);
    onBusyChange(true);
    try {
      const { data, error } = await supabase
        .from("special_products")
        .insert({
          ...form,
          name: form.name.trim(),
          category: form.category.trim(),
          unit: form.unit.trim(),
          supplier_id: form.supplier_id || null,
        })
        .select("*")
        .single();
      if (error) throw error;
      // Actualizar la caché antes del callback: queda disponible y seleccionado inmediatamente.
      queryClient.setQueryData<SpecialProduct[]>(["special-products"], (old) =>
        [...(old ?? []), data].sort((a, b) => a.name.localeCompare(b.name, "es")),
      );
      toast.success(`Producto especial ${data.sku} guardado`);
      onSaved(data);
      onClose();
    } catch (error) {
      toast.error(
        typeof error === "object" && error && "message" in error
          ? String(error.message)
          : "No se pudo guardar el producto especial",
      );
    } finally {
      setSaving(false);
      onBusyChange(false);
    }
  }
  return (
    <form onSubmit={save} className="mt-4 space-y-3">
      <label className="block">
        <span className="label">SKU</span>
        <input className="input" value="ESPxxxxxx · automático" readOnly />
      </label>
      <ProductDescriptionField
        id="special-product-name"
        value={form.name}
        onChange={(name) => setForm({ ...form, name })}
      />
      <label className="block">
        <span className="label">Categoría *</span>
        <input
          className="input"
          list="special-categories"
          required
          maxLength={80}
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        />
        <datalist id="special-categories">
          {CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <label className="block">
        <span className="label">Unidad de medida *</span>
        <input
          className="input"
          list="special-units"
          required
          value={form.unit}
          onChange={(e) => setForm({ ...form, unit: e.target.value })}
        />
        <datalist id="special-units">
          {PRODUCT_UNITS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
      </label>
      <label className="block">
        <span className="label">Proveedor de referencia</span>
        <select
          className="input"
          value={form.supplier_id}
          onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
        >
          <option value="">Sin proveedor</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {isError && (
        <p role="alert" className="text-destructive">
          No se pudieron cargar proveedores.
        </p>
      )}
      <label className="block">
        <span className="label">Costo unitario de referencia (CLP)</span>
        <input
          type="number"
          min="0"
          step="0.01"
          required
          className="input"
          value={form.unit_cost}
          onChange={(e) => setForm({ ...form, unit_cost: Number(e.target.value) })}
        />
      </label>
      <label className="block">
        <span className="label">Código de barras o QR (opcional)</span>
        <input
          className="input"
          maxLength={500}
          value={form.barcode}
          onChange={(e) => setForm({ ...form, barcode: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="label">Ubicación (referencia)</span>
        <input
          className="input"
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Fecha de compra, proveedor, cantidad y costos reales se registran al recibir la OC. Crear el
        producto no registra una compra.
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-secondary" disabled={saving} onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Guardando…" : "Guardar producto especial"}
        </button>
      </div>
    </form>
  );
}
