import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/lib/multiempresa/company-context";
import { loadMyCompanies } from "@/lib/multiempresa/company-api";
import {
  listTenantSaleCustomers, listTenantSalesNotes, listTenantSalesNoteUnits,
  listTenantCubicationCatalog, tenantQueryKeys,
} from "@/lib/multiempresa/tenant-catalog";
import {
  prepareTenantSalesNote, SALES_NOTE_WRITES_ENABLED, type SalesNoteDraft,
} from "@/lib/multiempresa/sales-note-draft";

type Unit = SalesNoteDraft["units"][number];

function SavedSalesNoteUnits({ companyId, noteId }: { companyId: string; noteId: string }) {
  const items = useQuery({
    queryKey: tenantQueryKeys.salesNoteUnits(companyId, noteId),
    queryFn: () => listTenantSalesNoteUnits(companyId, noteId),
    enabled: !!noteId,
  });
  if (items.isPending) return <p role="status">Consultando unidades…</p>;
  if (items.isError) return <p role="alert">No se pudieron cargar las unidades guardadas.</p>;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50"><tr><th className="p-2">Unidad</th>
          <th className="p-2">Tipo</th><th className="p-2">Módulos</th>
          <th className="p-2">Materiales guardados</th></tr></thead>
        <tbody>{items.data.map((item) => (
          <tr key={item.id} className="border-t">
            <td className="p-2">{item.unit_code_snapshot}</td>
            <td className="p-2">{item.cubication_kind}</td>
            <td className="p-2">{item.modules}</td>
            <td className="p-2">{Array.isArray(item.snapshot) ? item.snapshot.length : "Sin información"}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function SalesNotesForCompany({ companyId }: { companyId: string }) {
  const [number, setNumber] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [notes, setNotes] = useState("");
  const [units, setUnits] = useState<Unit[]>([{ kind: "normal", documentId: "", modules: "1" }]);
  const [review, setReview] = useState(false);
  const [detailId, setDetailId] = useState("");
  const access = useQuery({
    queryKey: ["tenant", companyId, "sales-note-role"],
    queryFn: async () => {
      const companies = await loadMyCompanies();
      const role = companies.find(({ company }) => company.id === companyId)?.role;
      return ["ADMIN", "ADMINPRO", "VENTAS", "VENTA"].includes(role ?? "");
    },
    staleTime: 0,
  });
  const customers = useQuery({
    queryKey: tenantQueryKeys.saleCustomers(companyId),
    queryFn: () => listTenantSaleCustomers(companyId),
  });
  const catalog = useQuery({
    queryKey: tenantQueryKeys.cubicationCatalog(companyId),
    queryFn: () => listTenantCubicationCatalog(companyId),
  });
  const history = useQuery({
    queryKey: tenantQueryKeys.salesNotes(companyId),
    queryFn: () => listTenantSalesNotes(companyId),
    staleTime: 0,
  });

  let prepared: ReturnType<typeof prepareTenantSalesNote> | null = null;
  let invalid = "";
  if (access.data && customers.isSuccess && catalog.isSuccess) {
    try {
      prepared = prepareTenantSalesNote({ companyId, number, customerId, notes, units });
      if (!customers.data.some((customer) => customer.id === customerId)) {
        throw new Error("Selecciona un cliente de esta empresa.");
      }
      if (prepared.units.some((item) => !catalog.data.some(
        (doc) => doc.id === item.document_id && doc.kind === item.kind,
      ))) throw new Error("Selecciona la cubicación guardada para cada unidad.");
    } catch (error) {
      invalid = error instanceof Error ? error.message : "Completa la Nota de Venta.";
    }
  }
  return (
    <div className="space-y-5">
      {access.isPending && <p role="status">Comprobando permisos…</p>}
      {access.isError && <p role="alert">No se pudo comprobar el perfil.</p>}
      {access.data === true && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold">Preparar nueva Nota de Venta</h2>
          <p className="mt-1 text-sm text-slate-600">
            Borrador de prueba; no registra datos. La creación está bloqueada hasta validar Auth.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">Número de NV
              <input value={number} maxLength={60} placeholder="NV-2026-001"
                onChange={(e) => { setNumber(e.target.value); setReview(false); }}
                className="mt-1 block w-full rounded border border-slate-300 p-2"/>
            </label>
            <label className="text-sm font-medium">Cliente
              <select value={customerId}
                onChange={(e) => { setCustomerId(e.target.value); setReview(false); }}
                className="mt-1 block w-full rounded border border-slate-300 bg-white p-2">
                <option value="">Seleccionar cliente</option>
                {(customers.data ?? []).map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
            </label>
          </div>
          <h3 className="mt-5 font-semibold">Unidades y cubicaciones</h3>
          {units.map((unit, index) => (
            <div key={index} className="mt-3 grid gap-3 rounded border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
              <label className="text-sm font-medium sm:col-span-2">Unidad {index + 1}
                <select value={unit.documentId ? unit.kind + ":" + unit.documentId : ""}
                  onChange={(e) => {
                    const selected = catalog.data?.find((doc) => doc.kind + ":" + doc.id === e.target.value);
                    setUnits((old) => old.map((row, i) => i === index
                      ? { ...row, documentId: selected?.id ?? "", kind: selected?.kind ?? "normal" } : row));
                    setReview(false);
                  }}
                  className="mt-1 block w-full rounded border border-slate-300 bg-white p-2">
                  <option value="">Elegir cubicación guardada</option>
                  {(catalog.data ?? []).map((doc) => (
                    <option key={doc.kind + ":" + doc.id} value={doc.kind + ":" + doc.id}>
                      {doc.unit_code} — {doc.kind === "normal" ? "Normal" : "Especial"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">Cantidad de módulos
                <input inputMode="numeric" value={unit.modules}
                  onChange={(e) => {
                    setUnits((old) => old.map((row, i) => i === index ? { ...row, modules: e.target.value } : row));
                    setReview(false);
                  }}
                  className="mt-1 block w-full rounded border border-slate-300 p-2"/>
              </label>
              {units.length > 1 && <button type="button"
                onClick={() => { setUnits((old) => old.filter((_, i) => i !== index)); setReview(false); }}
                className="text-left text-sm font-semibold text-red-700">Quitar unidad</button>}
            </div>
          ))}
          <button type="button" disabled={units.length >= 50}
            onClick={() => { setUnits((old) => [...old, { kind: "normal", documentId: "", modules: "1" }]); setReview(false); }}
            className="mt-3 rounded border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">
            Agregar unidad
          </button>
          <label className="mt-4 block text-sm font-medium">Observaciones
            <textarea value={notes} maxLength={500} rows={2}
              onChange={(e) => { setNotes(e.target.value); setReview(false); }}
              className="mt-1 block w-full rounded border border-slate-300 p-2"/>
          </label>
          {(customers.isError || catalog.isError) &&
            <p role="alert" className="mt-2 text-sm text-red-700">No se pudieron cargar los catálogos.</p>}
          {invalid && <p className="mt-3 text-sm text-amber-800">{invalid}</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" disabled={!prepared}
              onClick={() => setReview((old) => !old)}
              className="rounded border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-700 disabled:opacity-50">
              {review ? "Ocultar revisión" : "Revisar borrador"}
            </button>
            <button type="button" disabled={!SALES_NOTE_WRITES_ENABLED || !prepared}
              title="Pendiente de pruebas reales de autorización"
              className="cursor-not-allowed rounded bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">
              Registrar NV (pendiente)
            </button>
          </div>
          {review && prepared && (
            <div className="mt-3 rounded border border-teal-200 bg-teal-50 p-3 text-sm">
              <strong>NV {prepared.number}</strong>
              <p>Cliente: {customers.data?.find((item) => item.id === customerId)?.name}</p>
              <p>{prepared.units.length} unidades · {prepared.totalModules} módulos en total.</p>
              <p>Al habilitar la creación se guardará una copia histórica de cada cubicación.</p>
            </div>
          )}
        </section>
      )}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Notas de Venta registradas</h2>
        <p className="mt-1 text-sm text-slate-600">Últimas 100 NV de esta empresa. Consulta de solo lectura.</p>
        {history.isPending && <p role="status" className="mt-3">Consultando Notas de Venta…</p>}
        {history.isError && <p role="alert" className="mt-3">No se pudo consultar el historial.</p>}
        {history.isSuccess && history.data.length === 0 && (
          <p className="mt-3 text-sm text-slate-600">Aún no hay Notas de Venta registradas.</p>
        )}
        {history.isSuccess && history.data.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50"><tr>
                <th className="p-2">NV</th><th className="p-2">Cliente</th>
                <th className="p-2">Estado</th><th className="p-2">Fecha</th>
                <th className="p-2">Acción</th>
              </tr></thead>
              <tbody>{history.data.map((note) => (
                <tr key={note.id} className="border-t">
                  <td className="p-2">{note.note_number}</td>
                  <td className="p-2">{note.customer_name_snapshot}</td>
                  <td className="p-2">{note.status}</td>
                  <td className="p-2">{new Date(note.created_at).toLocaleString("es-CL")}</td>
                  <td className="p-2"><button type="button"
                    onClick={() => setDetailId((old) => old === note.id ? "" : note.id)}
                    className="rounded border px-2 py-1 text-sm">Ver unidades</button></td>
                </tr>
              ))}</tbody>
            </table>
            {detailId && <SavedSalesNoteUnits companyId={companyId} noteId={detailId}/>}
          </div>
        )}
      </section>
    </div>
  );
}

export function TenantSalesNotesPreview() {
  const companyId = useActiveCompany();
  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-8">
      <header className="rounded-xl bg-gradient-to-r from-slate-900 to-teal-700 p-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-100">INTEGRASTOCK · Multiempresa</p>
        <h1 className="mt-1 text-2xl font-bold">Notas de Venta</h1>
        <p className="mt-1 text-sm text-teal-100">Una NV puede contener múltiples módulos con cubicaciones propias.</p>
      </header>
      {companyId ? <SalesNotesForCompany key={companyId} companyId={companyId}/> :
        <p role="status">Selecciona una empresa para consultar las Notas de Venta.</p>}
    </main>
  );
}
