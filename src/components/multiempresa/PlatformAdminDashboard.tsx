import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAdminProCompanyUsers } from "@/lib/multiempresa/platform-admin-service";
import { Link } from "@tanstack/react-router";
import { Building2, Crown, CreditCard, ShieldCheck, Users, ArrowUpRight } from "lucide-react";
import { loadMyCompanies } from "@/lib/multiempresa/company-api";

export function PlatformAdminDashboard() {
  const [usersCompanyId, setUsersCompanyId] = useState<string | null>(null);
  const users = useAdminProCompanyUsers(usersCompanyId);
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
        <article className="rounded-xl border bg-white p-5"><Users className="text-teal-700" /><p className="mt-3 text-sm text-slate-500">Gestión de usuarios</p><p className="mt-1 text-base font-semibold">Próxima etapa</p><p className="text-xs text-slate-500">Altas, bajas y perfiles por empresa</p></article>
        <article className="rounded-xl border bg-white p-5"><CreditCard className="text-teal-700" /><p className="mt-3 text-sm text-slate-500">Suscripciones y pagos</p><p className="mt-1 text-base font-semibold">Pendiente de integración</p><p className="text-xs text-slate-500">No se muestran cobros ni estados inventados</p></article>
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
            onChange={(e) => setUsersCompanyId(e.target.value || null)}
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
              <thead className="bg-slate-50"><tr><th className="p-3">Correo</th><th className="p-3">Perfil</th><th className="p-3">Estado</th></tr></thead>
              <tbody>{users.data.map((user) => <tr key={user.user_id} className="border-t"><td className="p-3">{user.email}</td><td className="p-3">{user.role_code}</td><td className="p-3">{user.status === "active" ? "Activo" : "Inactivo"}</td></tr>)}</tbody>
            </table>
            {users.data.length === 0 && <p className="p-4 text-sm text-slate-500">Sin usuarios registrados para esta empresa.</p>}
          </div>
        )}
        <p className="text-xs text-amber-800">La creación y modificación de perfiles continúa restringida hasta incorporar invitaciones verificadas y auditoría de cambios.</p>
      </section>
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <ShieldCheck className="shrink-0" size={20}/>
        <p>Este panel central solo muestra empresas donde tienes autorización AdminPro. La administración global de suscripciones y el alta de nuevas empresas requieren servicios de backend dedicados; todavía no se han habilitado.</p>
      </div>
    </main>
  );
}
