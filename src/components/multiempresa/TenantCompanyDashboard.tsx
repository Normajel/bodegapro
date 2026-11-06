import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  ClipboardList,
  Truck,
  Users,
  FileText,
  ChartNoAxesCombined,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import { loadMyCompanies } from "@/lib/multiempresa/company-api";
import { useActiveCompany } from "@/lib/multiempresa/company-context";
import {
  listCompanyProducts,
  listCompanyPurchaseOrders,
  tenantQueryKeys,
} from "@/lib/multiempresa/tenant-catalog";

const modules = [
  { to: "/productos", label: "Inventario", hint: "Consultar productos y stock", icon: Package },
  { to: "/contactos", label: "Proveedores", hint: "Contactos de la empresa", icon: Users },
  {
    to: "/compras",
    label: "Órdenes de compra",
    hint: "Historial y estado de OC",
    icon: ClipboardList,
  },
  { to: "/movimientos", label: "Movimientos", hint: "Entradas y salidas", icon: Truck },
  {
    to: "/documento-cubicacion",
    label: "Documentos de cubicación",
    hint: "Unidades guardadas y PDF",
    icon: FileText,
  },
] as const;

export function TenantCompanyDashboard() {
  const companyId = useActiveCompany();
  const access = useQuery({
    queryKey: ["tenant", companyId ?? "", "home-access"],
    queryFn: async () =>
      (await loadMyCompanies()).find(({ company }) => company.id === companyId) ?? null,
    enabled: !!companyId,
    staleTime: 0,
  });
  const allowed = !!companyId && access.isSuccess && !!access.data;
  const products = useQuery({
    queryKey: tenantQueryKeys.products(companyId ?? ""),
    queryFn: () => listCompanyProducts(companyId!),
    enabled: allowed,
    staleTime: 0,
  });
  const orders = useQuery({
    queryKey: tenantQueryKeys.orders(companyId ?? ""),
    queryFn: () => listCompanyPurchaseOrders(companyId!),
    enabled: allowed,
    staleTime: 0,
  });
  const role = access.data?.role ?? "";
  const management = ["ADMIN", "ADMINPRO", "GERENCIA", "GERENTE"].includes(role);
  const availableModules = modules.filter((m) => m.to !== "/documento-cubicacion" || allowed);
  return (
    <main className="mx-auto max-w-7xl space-y-7 px-5 py-8">
      <header className="rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-teal-800 px-7 py-9 text-white">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-200">
          <LayoutDashboard size={16} /> ERP · Empresa
        </div>
        <h1 className="mt-3 text-3xl font-bold">
          {access.data?.company.name ?? "Tu empresa, en orden"}
        </h1>
        <p className="mt-2 text-sm text-teal-100">
          Compras, inventario y seguimiento de operaciones en un solo espacio, separado de las otras
          empresas.
        </p>
        {allowed && (
          <p className="mt-4 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
            Perfil activo: {role}
          </p>
        )}
      </header>
      {!companyId && (
        <p role="status" className="rounded-xl border bg-white p-5">
          Selecciona una empresa en la barra superior para ingresar a su ERP.
        </p>
      )}
      {companyId && access.isPending && <p role="status">Comprobando tu acceso…</p>}
      {companyId && (access.isError || (access.isSuccess && !access.data)) && (
        <p role="alert">No tienes acceso a esta empresa.</p>
      )}
      {allowed && (
        <>
          <section
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Resumen de empresa"
          >
            <article className="rounded-xl border bg-white p-5">
              <Package className="text-teal-700" />
              <p className="mt-3 text-sm text-slate-500">Productos registrados</p>
              <p className="mt-1 text-3xl font-bold">
                {products.isSuccess ? products.data.length : "—"}
              </p>
              <p className="text-xs text-slate-500">
                {products.isError ? "No se pudo consultar" : "Inventario de esta empresa"}
              </p>
            </article>
            <article className="rounded-xl border bg-white p-5">
              <ClipboardList className="text-teal-700" />
              <p className="mt-3 text-sm text-slate-500">Órdenes de compra</p>
              <p className="mt-1 text-3xl font-bold">
                {orders.isSuccess ? orders.data.length : "—"}
              </p>
              <p className="text-xs text-slate-500">
                {orders.isError ? "No se pudo consultar" : "Historial registrado"}
              </p>
            </article>
            <article className="rounded-xl border bg-white p-5">
              <ShieldCheck className="text-teal-700" />
              <p className="mt-3 text-sm text-slate-500">Acceso de empresa</p>
              <p className="mt-1 text-lg font-bold">Aislado</p>
              <p className="text-xs text-slate-500">
                Sesión y consultas verificadas por membresía y RLS
              </p>
            </article>
          </section>
          <section>
            <h2 className="mb-4 text-xl font-bold">Módulos de trabajo</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {availableModules.map(({ to, label, hint, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-500 hover:shadow-md"
                >
                  <Icon className="text-teal-700" size={25} />
                  <h3 className="mt-4 font-bold text-slate-900">{label}</h3>
                  <p className="mt-1 text-sm text-slate-500">{hint}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-teal-700">
                    Abrir <ArrowUpRight size={14} />
                  </span>
                </Link>
              ))}
              {management && (
                <Link
                  to="/panel-gerencial"
                  className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-500 hover:shadow-md"
                >
                  <ChartNoAxesCombined size={25} className="text-teal-700" />
                  <h3 className="mt-4 font-bold">Panel gerencial</h3>
                  <p className="mt-1 text-sm text-slate-500">Indicadores por empresa y gráficos</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-teal-700">
                    Abrir <ArrowUpRight size={14} />
                  </span>
                </Link>
              )}
            </div>
          </section>
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Versión multiempresa en desarrollo: los módulos que todavía no cuentan con operaciones
            seguras permanecen en consulta o deshabilitados.
          </p>
          {role === "ADMINPRO" && (
            <Link
              to="/adminpro"
              className="inline-flex items-center gap-2 rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800"
            >
              Volver al panel central AdminPro
            </Link>
          )}
        </>
      )}
    </main>
  );
}
