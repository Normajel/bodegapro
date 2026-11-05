import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { displayDate, paymentTermsLabel } from "@/lib/purchase-delivery";
import { santiagoDateTimeIso } from "@/lib/warehouse";

export function ServiceLedger() {
  const [provider, setProvider] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const { data: providers = [] } = useQuery({
    queryKey: ["service-providers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accepted_services")
        .select("supplier_id,supplier_name")
        .order("supplier_name");
      if (error) throw error;
      return [...new Map(data.map((r) => [r.supplier_id, r])).values()];
    },
  });
  const { data, isLoading, isError } = useQuery({
    queryKey: ["accepted-services", provider, from, until, status, page],
    refetchInterval: 60000,
    queryFn: async () => {
      let query = supabase
        .from("accepted_services")
        .select("*", { count: "exact" })
        .order("approved_at", { ascending: false })
        .order("id")
        .range(page * 50, page * 50 + 49);
      if (provider) query = query.eq("supplier_id", provider);
      if (from) query = query.gte("approved_at", santiagoDateTimeIso(from));
      if (until) query = query.lt("approved_at", santiagoDateTimeIso(until, 24));
      if (status) query = query.eq("status", status);
      const result = await query;
      if (result.error) throw result.error;
      return result;
    },
  });
  const { data: priceCatalog = [], isError: priceCatalogError } = useQuery({
    queryKey: ["contractor-service-prices"],
    queryFn: async () => {
      const result = await supabase
        .from("contractor_service_prices" as never)
        .select("supplier_id,service_name,current_unit_cost")
        .order("service_name");
      if (result.error) throw result.error;
      return (result.data ?? []) as unknown as Array<{
        supplier_id: string;
        service_name: string;
        current_unit_cost: number;
      }>;
    },
  });
  const rows = data?.data ?? [];
  return (
    <section className="space-y-3" aria-label="Servicios contratistas">
      <p className="text-sm text-muted-foreground">
        Servicios realizados por contratistas, contratados mediante OC. ACEPTADO indica aprobación,
        no ejecución ni pago. No modifica inventario.
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="label">
          Contratista
          <select
            className="input"
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todos los contratistas</option>
            {providers.map((p) => (
              <option key={p.supplier_id} value={p.supplier_id}>
                {p.supplier_name}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Aprobación desde
          <input
            className="input"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="label">
          Aprobación hasta
          <input
            className="input"
            type="date"
            value={until}
            onChange={(e) => {
              setUntil(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="label">
          Estado
          <select
            className="input"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todos</option>
            <option>ACEPTADO</option>
            <option>ANULADO</option>
          </select>
        </label>
      </div>
      {isError ? (
        <p role="alert" className="text-destructive">
          No se pudo cargar la planilla de servicios.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base min-w-[1100px]">
            <thead>
              <tr>
                {[
                  "Contratista",
                  "N° OC",
                  "Servicio",
                  "Ingreso",
                  "Aprobación",
                  "Condiciones de pago",
                  "Cantidad",
                  "Total con IVA",
                  "Estado",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9}>Cargando servicios…</td>
                </tr>
              ) : !rows.length ? (
                <tr>
                  <td colSpan={9}>No hay servicios con estos filtros.</td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.supplier_name}</td>
                    <td>{r.order_number}</td>
                    <td>{r.description}</td>
                    <td>{displayDate(r.entered_at)}</td>
                    <td>{displayDate(r.approved_at)}</td>
                    <td>{paymentTermsLabel(r.payment_terms)}</td>
                    <td>
                      {r.quantity} {r.measure_unit}
                    </td>
                    <td>${Number(r.total).toLocaleString("es-CL")}</td>
                    <td>
                      <span
                        className={`badge ${r.status === "ACEPTADO" ? "badge-success" : "badge-destructive"}`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      <section className="space-y-2" aria-label="Historial de servicios">
        <h2 className="font-semibold">Historial de servicios y valores actuales</h2>
        <p className="text-sm text-muted-foreground">Cada servicio aparece una vez por contratista. Al cambiar su valor, aquí se muestra el vigente.</p>
        {priceCatalogError ? (
          <p className="text-sm text-muted-foreground">El historial de valores no está disponible hasta aplicar la migración de base de datos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base w-full">
              <thead><tr><th>Nombre</th><th>Servicio</th><th>Valor del servicio (neto)</th></tr></thead>
              <tbody>
                {priceCatalog.filter((item) => !provider || item.supplier_id === provider).map((item) => (
                  <tr key={item.supplier_id + item.service_name}>
                    <td>{providers.find((supplier) => supplier.supplier_id === item.supplier_id)?.supplier_name ?? "Contratista"}</td>
                    <td>{item.service_name}</td>
                    <td>${Number(item.current_unit_cost).toLocaleString("es-CL")}</td>
                  </tr>
                ))}
                {!priceCatalog.some((item) => !provider || item.supplier_id === provider) && (
                  <tr><td colSpan={3}>No hay servicios registrados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>
          {data?.count ?? 0} servicios · página {page + 1}
        </span>
        <div className="flex gap-2">
          <button
            className="btn btn-secondary"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </button>
          <button
            className="btn btn-secondary"
            disabled={(page + 1) * 50 >= (data?.count ?? 0)}
            onClick={() => setPage(page + 1)}
          >
            Siguiente
          </button>
        </div>
      </div>
    </section>
  );
}
