import { PlatformOperations } from "./PlatformOperations";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  useAdminProCompanyUsers,
  loadAdminProCompanyBilling,
  loadAdminProRoleHistory,
  updateAdminProCompanyMemberRole,
  type EditableCompanyRole,
} from "@/lib/multiempresa/platform-admin-service";
import { Link } from "@tanstack/react-router";
import { Building2, Crown, CreditCard, ShieldCheck, Users, ArrowUpRight } from "lucide-react";
import { loadMyCompanies } from "@/lib/multiempresa/company-api";

export function PlatformAdminDashboard() {
  const [usersCompanyId, setUsersCompanyId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [roleEdit, setRoleEdit] = useState<{userId:string;role:EditableCompanyRole} | null>(null);
  const users = useAdminProCompanyUsers(usersCompanyId);
  const billing = useQuery({
    queryKey: ["platform","billing",usersCompanyId ?? ""],
    queryFn: () => loadAdminProCompanyBilling(usersCompanyId!),
    enabled: !!usersCompanyId, staleTime: 0,
  });
  const roleHistory = useQuery({
    queryKey: ["platform","role-history",usersCompanyId ?? ""],
    queryFn: () => loadAdminProRoleHistory(usersCompanyId!),
    enabled: !!usersCompanyId, staleTime: 0,
  });
  const roleChange = useMutation({
    mutationFn: async (values: {companyId:string;userId:string;role:EditableCompanyRole}) =>
      updateAdminProCompanyMemberRole(values.companyId,values.userId,values.role),
    onSuccess: async (_result, values) => {
      setRoleEdit(null);
      await queryClient.invalidateQueries({queryKey:["platform","company-users",values.companyId]});
      await queryClient.invalidateQueries({queryKey:["platform","role-history",values.companyId]});
    },
  });
  const memberships = useQuery({
    queryKey: ["platform", "my-adminpro-companies"],
    queryFn: loadMyCompanies,
    staleTime: 0,
  });
  const managed = (memberships.data ?? []).filter((item) => item.role === "ADMINPRO");
  if (memberships.isPending) return <main className="mx-auto max-w-6xl px-5 py-10">Verificando acceso AdminPro…</main>;
  if (memberships.isError || managed.length === 0) {
    return <main className="mx-auto max-w-6xl px-5 py-10" role="alert">No tienes autorización AdminPro para el panel central.</main>;
  }
  return (
    <main className="mx-auto max-w-7xl space-y-8 px-5 py-8">
      <header className="rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-teal-800 px-7 py-9 text-white">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold tracking-wider"><Crown size={15} /> ADMINPRO · PLATAFORMA</span>
        <h1 className="mt-4 text-3xl font-bold">Administración central</h1>
        <p className="mt-2 max-w-2xl text-sm text-teal-100">Espacio de administración de IntegraStock. No es el ERP que utilizan los clientes; cada empresa conserva sus propias operaciones y permisos.</p>
      </header>
      <section className="grid gap-4 md:grid-cols-3" aria-label="Resumen de plataforma">
        <article className="rounded-xl border bg-white p-5"><Building2 className="text-teal-700" /><p className="mt-3 text-sm text-slate-500">Empresas bajo tu administración</p><p className="mt-1 text-3xl font-bold">{managed.length}</p><p className="text-xs text-slate-500">Solo membresías AdminPro autorizadas</p></article>
        <article className="rounded-xl border bg-white p-5"><Users className="text-teal-700" /><p className="mt-3 text-sm text-slate-500">Gestión de usuarios</p><p className="mt-1 text-base font-semibold">Directorio habilitado</p><p className="text-xs text-slate-500">Consultar usuarios y roles por empresa; cambios de permisos aún restringidos</p></article>
        <article className="rounded-xl border bg-white p-5"><CreditCard className="text-teal-700" /><p className="mt-3 text-sm text-slate-500">Suscripciones y pagos</p><p className="mt-1 text-base font-semibold">Consulta de facturación</p><p className="text-xs text-slate-500">Planes, estado y pagos registrados, sin emitir cobros</p></article>
      </section>
      <section>
        <div className="mb-4 flex items-center gap-2"><Building2 className="text-teal-700" /><h2 className="text-xl font-bold">Empresas habilitadas</h2></div>
        <div className="grid gap-4 md:grid-cols-2">
          {managed.map(({ company, role }) => (
            <article key={company.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{company.name}</h3><p className="mt-1 text-sm text-slate-500">Tu perfil: {role}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">Activa</span></div>
              <p className="mt-4 text-sm text-slate-600">Para trabajar en su ERP, selecciona esta empresa en la barra superior.</p>
              <Link to="/dashboard" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">Ir al ERP de empresa <ArrowUpRight size={16}/></Link>
            </article>
          ))}
        </div>
      </section>
      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5" aria-label="Usuarios de empresas">
        <div>
          <h2 className="text-xl font-bold">Usuarios y perfiles</h2>
          <p className="mt-1 text-sm text-slate-600">Consulta protegida por empresa. Solo se muestran usuarios de una compañía en la que eres AdminPro.</p>
        </div>
        <label className="block max-w-md text-sm font-medium">
          Empresa
          <select
            value={usersCompanyId ?? ""}
            onChange={(e) => {setUsersCompanyId(e.target.value || null);setRoleEdit(null);roleChange.reset();}}
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2"
          >
            <option value="">Seleccionar empresa</option>
            {managed.map(({ company }) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </label>
        {usersCompanyId && users.isPending && <p role="status">Consultando perfiles autorizados…</p>}
        {usersCompanyId && users.isError && <p role="alert" className="text-sm text-red-700">No se pudo consultar el personal de esta empresa.</p>}
        {usersCompanyId && users.isSuccess && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50"><tr><th className="p-3">Correo</th><th className="p-3">Perfil</th><th className="p-3">Estado</th><th className="p-3">Acción</th></tr></thead>
              <tbody>{users.data.map((user) => <tr key={user.user_id} className="border-t">
                <td className="p-3">{user.email}</td><td className="p-3">{user.role_code}</td>
                <td className="p-3">{user.status === "active" ? "Activo" : "Inactivo"}</td>
                <td className="p-3">
                  {user.role_code === "ADMINPRO" || user.status !== "active"
                    ? <span className="text-xs text-slate-500">Protegido</span>
                    : <button className="rounded border px-3 py-1 text-teal-700" type="button" onClick={() => {setRoleEdit({userId:user.user_id,role:user.role_code as EditableCompanyRole});roleChange.reset();}}>Cambiar perfil</button>}
                </td>
              </tr>)}</tbody>
            </table>
            {users.data.length === 0 && <p className="p-4 text-sm text-slate-500">Sin usuarios registrados para esta empresa.</p>}
          </div>
        )}
        {roleEdit && usersCompanyId && (
          <div className="rounded-lg border border-teal-200 bg-teal-50 p-4">
            <p className="font-semibold">Modificar perfil de {users.data?.find((u) => u.user_id === roleEdit.userId)?.email ?? "usuario"}</p>
            <p className="mt-1 text-sm text-slate-700">Esta acción modifica permisos en esta empresa y queda registrada en auditoría.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select aria-label="Nuevo perfil" value={roleEdit.role} onChange={(e) => setRoleEdit({...roleEdit,role:e.target.value as EditableCompanyRole})} className="rounded border bg-white p-2">
                <option value="ADMIN">Admin</option><option value="GERENCIA">Gerencia</option>
                <option value="GERENTE">Gerente</option><option value="BODEGA">Bodega</option>
                <option value="VENTAS">Ventas</option><option value="JEFE_PRODUCCION">Jefe de producción</option>
              </select>
              <button type="button" disabled={roleChange.isPending} onClick={() => roleChange.mutate({companyId:usersCompanyId,userId:roleEdit.userId,role:roleEdit.role})} className="rounded bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Confirmar cambio</button>
              <button type="button" className="rounded border px-4 py-2 text-sm" onClick={() => setRoleEdit(null)}>Cancelar</button>
            </div>
          </div>
        )}
        {roleChange.isError && <p role="alert" className="text-sm text-red-700">{roleChange.error instanceof Error ? roleChange.error.message : "No se pudo modificar el perfil."}</p>}
        {roleChange.isSuccess && <p role="status" className="text-sm text-teal-700">Perfil actualizado y auditado.</p>}
        <p className="text-xs text-amber-800">AdminPro está protegido. Por seguridad aún no se pueden crear usuarios nuevos desde aquí: se necesita un flujo de invitación verificada.</p>
        {usersCompanyId && (
          <details className="rounded-lg border bg-slate-50 p-4">
            <summary className="cursor-pointer font-semibold">Historial de cambios de perfiles</summary>
            {roleHistory.isPending && <p role="status" className="mt-2 text-sm">Consultando auditoría…</p>}
            {roleHistory.isError && <p role="alert" className="mt-2 text-sm text-red-700">No se pudo consultar el historial.</p>}
            {roleHistory.isSuccess && (
              roleHistory.data.length ? <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
                <thead><tr><th className="p-2">Fecha</th><th className="p-2">Modificó</th><th className="p-2">Usuario</th><th className="p-2">Cambio</th></tr></thead>
                <tbody>{roleHistory.data.map((entry,index) => <tr className="border-t" key={entry.changed_at + entry.target_email + index}>
                  <td className="p-2">{new Date(entry.changed_at).toLocaleString("es-CL")}</td>
                  <td className="p-2">{entry.actor_email}</td><td className="p-2">{entry.target_email}</td>
                  <td className="p-2">{entry.old_role} → {entry.new_role}</td>
                </tr>)}</tbody></table></div> : <p className="mt-2 text-sm text-slate-500">Todavía no hay cambios de perfiles registrados.</p>
            )}
          </details>
        )}
        <div className="mt-5 border-t pt-5">
          <h3 className="text-lg font-bold">Suscripción y pagos de la empresa</h3>
          {!usersCompanyId && <p className="text-sm text-slate-500">Selecciona una empresa para consultar sus datos.</p>}
          {usersCompanyId && billing.isPending && <p role="status">Consultando facturación…</p>}
          {usersCompanyId && billing.isError && <p role="alert" className="text-red-700">No se pudo consultar la facturación.</p>}
          {usersCompanyId && billing.isSuccess && (
            billing.data?.subscription_status ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                <p><strong>Plan:</strong> {billing.data.plan_name ?? "No especificado"}</p>
                <p><strong>Estado:</strong> {billing.data.subscription_status}</p>
                <p><strong>Tarifa:</strong> {billing.data.amount_clp == null ? "Sin valor registrado" : new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}).format(Number(billing.data.amount_clp))}</p>
                <p><strong>Intervalo:</strong> {billing.data.billing_interval ?? "—"}</p>
                <p><strong>Vencimiento período:</strong> {billing.data.period_end ?? "—"}</p>
                <p><strong>Facturas:</strong> {billing.data.invoice_count}</p>
                <p><strong>Pagos confirmados:</strong> {new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}).format(Number(billing.data.confirmed_payment_clp))}</p>
              </div>
            ) : <p className="mt-2 text-sm text-slate-600">Esta empresa no tiene una suscripción registrada. No se han generado cargos.</p>
          )}
          <p className="mt-3 text-xs text-amber-800">Consulta solamente: la activación de planes, la facturación y la verificación de pagos requieren un proceso administrativo separado.</p>
        </div>
      </section>
      <PlatformOperations />
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <ShieldCheck className="shrink-0" size={20}/>
        <p>Este panel central solo muestra empresas donde tienes autorización AdminPro. La administración global de suscripciones, el alta de nuevas empresas y las invitaciones de usuarios requieren servicios adicionales; no están habilitados.</p>
      </div>
    </main>
  );
}
