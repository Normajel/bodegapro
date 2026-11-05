import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 10;
const dateFormat = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Santiago",
});

export function InventoryAdjustmentHistory({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Pick<Tables<"inventory_adjustments">, "id" | "reason" | "adjusted_stock"> | null>(null);
  const [adjustedStock, setAdjustedStock] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const query = useQuery({
    queryKey: ["inventory-adjustments", page],
    queryFn: async () => {
      const start = page * PAGE_SIZE;
      const { data, error } = await supabase
        .from("inventory_adjustments")
        .select("id, description, category, initial_stock, adjusted_stock, created_at, reason")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(start, start + PAGE_SIZE);
      if (error) throw error;
      return data;
    },
  });

  async function saveAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !editing || saving || !reason.trim()) return;
    const quantity = Number(adjustedStock);
    if (!adjustedStock.trim() || !Number.isSafeInteger(quantity) || quantity < 0) {
      toast.error("Ingresa un stock ajustado entero igual o mayor a cero");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("inventory_adjustments")
        .update({ reason: reason.trim(), adjusted_stock: quantity })
        .eq("id", editing.id)
        .eq("reason", editing.reason)
        .eq("adjusted_stock", editing.adjusted_stock)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setEditing(null);
        await queryClient.invalidateQueries({ queryKey: ["inventory-adjustments"] });
        toast.error("El registro cambió. Vuelve a abrirlo para editar el ajuste.");
        return;
      }
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["inventory-adjustments"] });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Ajuste actualizado");
    } catch (error) {
      const message = error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "No se pudo actualizar el ajuste";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  const rows = query.data ?? [];
  return (
    <section className="card space-y-3 p-4" aria-labelledby="inventory-adjustments-title">
      <h2 id="inventory-adjustments-title" className="font-display text-lg font-bold">
        Historial de ajustes de inventario
      </h2>
      {query.isPending && <p>Cargando ajustes…</p>}
      {query.isError && <p role="alert">No se pudo cargar el historial de ajustes.</p>}
      {query.isSuccess && rows.length === 0 && <p>Aún no hay ajustes registrados.</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="p-2">Descripción</th>
                <th className="p-2">Categoría</th>
                <th className="p-2">Stock inicial</th>
                <th className="p-2">Stock ajustado</th>
                <th className="p-2">Fecha</th>
                <th className="p-2">Motivo</th>
                {canEdit && <th className="p-2">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, PAGE_SIZE).map((row) => (
                <tr key={row.id} className="border-b border-border align-top">
                  <td className="p-2">{row.description}</td>
                  <td className="p-2">{row.category}</td>
                  <td className="p-2">{row.initial_stock.toLocaleString("es-CL")}</td>
                  <td className="p-2">
                    {canEdit && editing?.id === row.id ? (
                      <input
                        aria-label="Stock ajustado"
                        form="edit-inventory-adjustment"
                        className="input w-28"
                        type="number"
                        min={0}
                        step={1}
                        required
                        value={adjustedStock}
                        onChange={(event) => setAdjustedStock(event.target.value)}
                      />
                    ) : (
                      row.adjusted_stock.toLocaleString("es-CL")
                    )}
                  </td>
                  <td className="whitespace-nowrap p-2">{dateFormat.format(new Date(row.created_at))}</td>
                  <td className="max-w-xs whitespace-pre-wrap break-words p-2">
                    {canEdit && editing?.id === row.id ? (
                      <form id="edit-inventory-adjustment" className="space-y-2" onSubmit={(event) => void saveAdjustment(event)}>
                        <textarea
                          aria-label="Motivo del ajuste"
                          className="input w-full"
                          required
                          maxLength={500}
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button className="btn btn-primary" disabled={saving || !reason.trim()}>Guardar</button>
                          <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setEditing(null)}>Cancelar</button>
                        </div>
                      </form>
                    ) : row.reason}
                  </td>
                  {canEdit && (
                    <td className="p-2">
                      <button
                        type="button"
                        className="btn btn-secondary whitespace-nowrap"
                        disabled={saving || editing?.id === row.id}
                        onClick={() => {
                          setReason(row.reason);
                          setAdjustedStock(String(row.adjusted_stock));
                          setEditing(row);
                        }}
                      >
                        Editar ajuste
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(page > 0 || rows.length > PAGE_SIZE) && (
        <div className="flex items-center gap-2 text-sm">
          <button type="button" className="btn btn-secondary" disabled={saving || page === 0}
            onClick={() => { setEditing(null); setPage(page - 1); }}>Anterior</button>
          <span>Página {page + 1}</span>
          <button type="button" className="btn btn-secondary" disabled={saving || rows.length <= PAGE_SIZE}
            onClick={() => { setEditing(null); setPage(page + 1); }}>Siguiente</button>
        </div>
      )}
    </section>
  );
}
