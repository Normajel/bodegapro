import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
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
  const [editingId, setEditingId] = useState<string | null>(null);
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

  async function saveReason(event: FormEvent<HTMLFormElement>, id: string, previous: string) {
    event.preventDefault();
    if (!canEdit || saving || !reason.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("inventory_adjustments")
        .update({ reason: reason.trim() })
        .eq("id", id)
        .eq("reason", previous)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setEditingId(null);
        await queryClient.invalidateQueries({ queryKey: ["inventory-adjustments"] });
        toast.error("El registro cambió. Vuelve a abrirlo para editar el motivo.");
        return;
      }
      setEditingId(null);
      await queryClient.invalidateQueries({ queryKey: ["inventory-adjustments"] });
      toast.success("Motivo actualizado");
    } catch {
      toast.error("No se pudo actualizar el motivo del ajuste");
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
                  <td className="p-2">{row.adjusted_stock.toLocaleString("es-CL")}</td>
                  <td className="whitespace-nowrap p-2">{dateFormat.format(new Date(row.created_at))}</td>
                  <td className="max-w-xs whitespace-pre-wrap break-words p-2">
                    {canEdit && editingId === row.id ? (
                      <form className="space-y-2" onSubmit={(event) => void saveReason(event, row.id, row.reason)}>
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
                          <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setEditingId(null)}>Cancelar</button>
                        </div>
                      </form>
                    ) : row.reason}
                  </td>
                  {canEdit && (
                    <td className="p-2">
                      <button
                        type="button"
                        className="btn btn-secondary whitespace-nowrap"
                        disabled={saving || editingId === row.id}
                        onClick={() => {
                          setReason(row.reason);
                          setEditingId(row.id);
                        }}
                      >
                        Editar motivo
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
            onClick={() => { setEditingId(null); setPage(page - 1); }}>Anterior</button>
          <span>Página {page + 1}</span>
          <button type="button" className="btn btn-secondary" disabled={saving || rows.length <= PAGE_SIZE}
            onClick={() => { setEditingId(null); setPage(page + 1); }}>Siguiente</button>
        </div>
      )}
    </section>
  );
}
