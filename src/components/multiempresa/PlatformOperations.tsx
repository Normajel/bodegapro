import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getPlatformOverview,
  isPlatformOwner,
  platformCreateCompany,
  platformCreatePlan,
  platformActivatePlan,
  platformCreateInvoice,
  platformRecordPayment,
  platformConfirmPayment,
  platformInviteUser,
  platformListInvitations,
} from "@/lib/multiempresa/platform-operations";

const money = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
const control = "w-full rounded-lg border border-slate-300 bg-white p-2 text-sm";
const action =
  "rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const roles = ["ADMIN", "GERENCIA", "GERENTE", "BODEGA", "VENTAS", "JEFE_PRODUCCION"] as const;

export function PlatformOperations() {
  const client = useQueryClient();
  const owner = useQuery({
    queryKey: ["platform", "owner"],
    queryFn: isPlatformOwner,
    staleTime: 0,
  });
  const overview = useQuery({
    queryKey: ["platform", "operations"],
    queryFn: getPlatformOverview,
    enabled: owner.data === true,
    staleTime: 0,
  });
  const invitations = useQuery({
    queryKey: ["platform", "invitations"],
    queryFn: platformListInvitations,
    enabled: owner.data === true,
    staleTime: 0,
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [planCode, setPlanCode] = useState("");
  const [planName, setPlanName] = useState("");
  const [price, setPrice] = useState("");
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [maxUsers, setMaxUsers] = useState("10");
  const [subCompany, setSubCompany] = useState("");
  const [subPlan, setSubPlan] = useState("");
  const [subStatus, setSubStatus] = useState<"trial" | "active">("trial");
  const [periodEnd, setPeriodEnd] = useState("");
  const [invoiceCompany, setInvoiceCompany] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [payInvoice, setPayInvoice] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"transfer" | "card" | "cash" | "other">("transfer");
  const [payReference, setPayReference] = useState("");
  const [inviteCompany, setInviteCompany] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<(typeof roles)[number]>("ADMIN");

  const execute = async (work: () => Promise<unknown>, description: string) => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await work();
      await client.invalidateQueries({ queryKey: ["platform", "operations"] });
      await client.invalidateQueries({ queryKey: ["platform", "invitations"] });
      await client.invalidateQueries({ queryKey: ["platform", "my-adminpro-companies"] });
      setMessage(description);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la operación.");
    } finally {
      setBusy(false);
    }
  };
  if (owner.isPending) return <p role="status">Verificando administrador central…</p>;
  if (owner.isError || !owner.data)
    return (
      <p className="rounded border p-4 text-sm">
        La administración central de empresas está reservada a la cuenta propietaria de la
        plataforma.
      </p>
    );
  return (
    <section className="space-y-5" aria-label="Administración global de IntegraStock">
      <div>
        <h2 className="text-xl font-bold">Operaciones de la plataforma</h2>
        <p className="text-sm text-slate-600">
          Altas de empresas, planes, invitaciones y pagos manuales. Se registra la actuación del
          administrador.
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="rounded border border-teal-300 bg-teal-50 p-3 text-sm text-teal-900"
        >
          {message}
        </p>
      )}
      {overview.isPending && <p role="status">Consultando datos de la plataforma…</p>}
      {overview.isError && <p role="alert">No fue posible consultar empresas y suscripciones.</p>}
      {overview.isSuccess && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void execute(
                  () => platformCreateCompany(companyName, taxId),
                  "Empresa creada. Tu cuenta conserva acceso AdminPro.",
                );
                setCompanyName("");
                setTaxId("");
              }}
              className="space-y-3 rounded-xl border bg-white p-5"
            >
              <h3 className="font-bold">Nueva empresa</h3>
              <label className="block text-sm">
                Razón social o nombre
                <input
                  required
                  minLength={2}
                  maxLength={160}
                  className={control}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                RUT (opcional)
                <input
                  maxLength={32}
                  className={control}
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                />
              </label>
              <button disabled={busy} className={action}>
                Crear empresa
              </button>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void execute(
                  () =>
                    platformCreatePlan(
                      planCode,
                      planName,
                      Number(price),
                      interval,
                      Number(maxUsers),
                    ),
                  "Plan registrado.",
                );
              }}
              className="space-y-3 rounded-xl border bg-white p-5"
            >
              <h3 className="font-bold">Nuevo plan</h3>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm">
                  Código
                  <input
                    required
                    pattern="[a-z0-9_-]{2,40}"
                    className={control}
                    value={planCode}
                    onChange={(e) => setPlanCode(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Nombre
                  <input
                    required
                    minLength={2}
                    className={control}
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Precio CLP
                  <input
                    required
                    type="number"
                    min={0}
                    step={1}
                    className={control}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Usuarios máximos
                  <input
                    required
                    type="number"
                    min={1}
                    step={1}
                    className={control}
                    value={maxUsers}
                    onChange={(e) => setMaxUsers(e.target.value)}
                  />
                </label>
              </div>
              <label className="block text-sm">
                Periodicidad
                <select
                  className={control}
                  value={interval}
                  onChange={(e) => setInterval(e.target.value as "monthly" | "annual")}
                >
                  <option value="monthly">Mensual</option>
                  <option value="annual">Anual</option>
                </select>
              </label>
              <button disabled={busy} className={action}>
                Registrar plan
              </button>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void execute(
                  () => platformActivatePlan(subCompany, subPlan, subStatus, periodEnd),
                  "Suscripción actualizada.",
                );
              }}
              className="space-y-3 rounded-xl border bg-white p-5"
            >
              <h3 className="font-bold">Asignar o activar plan</h3>
              <label className="block text-sm">
                Empresa
                <select
                  required
                  className={control}
                  value={subCompany}
                  onChange={(e) => setSubCompany(e.target.value)}
                >
                  <option value="">Seleccionar empresa</option>
                  {overview.data.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Plan
                <select
                  required
                  className={control}
                  value={subPlan}
                  onChange={(e) => setSubPlan(e.target.value)}
                >
                  <option value="">Seleccionar plan</option>
                  {overview.data.plans
                    .filter((p) => p.active)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {money(Number(p.price_clp))}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block text-sm">
                Estado
                <select
                  className={control}
                  value={subStatus}
                  onChange={(e) => setSubStatus(e.target.value as "trial" | "active")}
                >
                  <option value="trial">Prueba</option>
                  <option value="active">Activa</option>
                </select>
              </label>
              <label className="block text-sm">
                Vencimiento
                <input
                  type="date"
                  required
                  className={control}
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                />
              </label>
              <button disabled={busy} className={action}>
                Guardar suscripción
              </button>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void execute(
                  () => platformInviteUser(inviteCompany, inviteEmail, inviteRole),
                  "Invitación solicitada a Supabase Auth. Revisa el correo del destinatario.",
                );
              }}
              className="space-y-3 rounded-xl border bg-white p-5"
            >
              <h3 className="font-bold">Invitar usuario</h3>
              <p className="text-xs text-slate-500">
                Solo empresas con plan activo y cupos. Supabase enviará el correo para una cuenta
                nueva.
              </p>
              <label className="block text-sm">
                Empresa
                <select
                  required
                  className={control}
                  value={inviteCompany}
                  onChange={(e) => setInviteCompany(e.target.value)}
                >
                  <option value="">Seleccionar empresa</option>
                  {overview.data.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Correo
                <input
                  type="email"
                  required
                  className={control}
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Perfil
                <select
                  className={control}
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as (typeof roles)[number])}
                >
                  {roles.map((r) => (
                    <option value={r} key={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <button disabled={busy} className={action}>
                Enviar invitación
              </button>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void execute(
                  () =>
                    platformCreateInvoice(
                      invoiceCompany,
                      invoiceNumber,
                      invoiceDate,
                      Number(invoiceAmount),
                    ),
                  "Factura registrada como pendiente.",
                );
              }}
              className="space-y-3 rounded-xl border bg-white p-5"
            >
              <h3 className="font-bold">Registrar factura</h3>
              <label className="block text-sm">
                Empresa
                <select
                  required
                  className={control}
                  value={invoiceCompany}
                  onChange={(e) => setInvoiceCompany(e.target.value)}
                >
                  <option value="">Seleccionar empresa</option>
                  {overview.data.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Número
                <input
                  required
                  minLength={3}
                  className={control}
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Monto CLP
                <input
                  type="number"
                  min={1}
                  step={1}
                  required
                  className={control}
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Vencimiento
                <input
                  type="date"
                  required
                  className={control}
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </label>
              <button disabled={busy} className={action}>
                Registrar factura
              </button>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void execute(
                  () =>
                    platformRecordPayment(payInvoice, Number(payAmount), payMethod, payReference),
                  "Pago registrado pendiente de verificación.",
                );
              }}
              className="space-y-3 rounded-xl border bg-white p-5"
            >
              <h3 className="font-bold">Registrar pago</h3>
              <label className="block text-sm">
                Factura
                <select
                  required
                  className={control}
                  value={payInvoice}
                  onChange={(e) => setPayInvoice(e.target.value)}
                >
                  <option value="">Seleccionar factura</option>
                  {overview.data.invoices
                    .filter((i) => i.status !== "void")
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.invoice_number} · {money(Number(i.amount_clp))}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block text-sm">
                Monto CLP
                <input
                  required
                  type="number"
                  step={1}
                  min={1}
                  className={control}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Medio de pago
                <select
                  className={control}
                  value={payMethod}
                  onChange={(e) =>
                    setPayMethod(e.target.value as "transfer" | "card" | "cash" | "other")
                  }
                >
                  <option value="transfer">Transferencia</option>
                  <option value="card">Tarjeta</option>
                  <option value="cash">Efectivo</option>
                  <option value="other">Otro</option>
                </select>
              </label>
              <label className="block text-sm">
                Referencia verificable
                <input
                  required
                  minLength={3}
                  className={control}
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                />
              </label>
              <button disabled={busy} className={action}>
                Registrar como pendiente
              </button>
            </form>
          </div>
          <div className="rounded-xl border bg-white p-5">
            <h3 className="font-bold">Historial de invitaciones</h3>
            {invitations.isPending && (
              <p role="status" className="mt-2 text-sm">
                Consultando invitaciones…
              </p>
            )}
            {invitations.isError && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                No se pudieron consultar las invitaciones.
              </p>
            )}
            {invitations.isSuccess &&
              (invitations.data.length ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr>
                        <th className="p-2">Empresa</th>
                        <th className="p-2">Correo</th>
                        <th className="p-2">Perfil</th>
                        <th className="p-2">Estado</th>
                        <th className="p-2">Enviada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invitations.data.map((i) => (
                        <tr className="border-t" key={i.company_id + i.email}>
                          <td className="p-2">{i.company_name}</td>
                          <td className="p-2">{i.email}</td>
                          <td className="p-2">{i.role_code}</td>
                          <td className="p-2">
                            {i.status === "sent"
                              ? "Enviada"
                              : i.status === "accepted"
                                ? "Aceptada"
                                : "Revocada"}
                          </td>
                          <td className="p-2">{new Date(i.created_at).toLocaleString("es-CL")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  No se han enviado invitaciones desde esta plataforma.
                </p>
              ))}
          </div>
          <div className="rounded-xl border bg-white p-5">
            <h3 className="font-bold">Pagos pendientes de verificación</h3>
            <p className="mb-3 text-sm text-slate-600">
              Confirma solo después de comprobar el abono externo. No se realiza ningún cobro
              automático.
            </p>
            <div className="space-y-2">
              {overview.data.payments
                .filter((p) => p.status === "pending_verification")
                .map((p) => (
                  <div
                    className="flex flex-wrap items-center justify-between gap-3 rounded border p-3 text-sm"
                    key={p.id}
                  >
                    <span>
                      {p.payment_reference} · {money(Number(p.amount_clp))} · {p.method}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      className={action}
                      onClick={() =>
                        void execute(
                          () => platformConfirmPayment(p.id),
                          "Pago confirmado y factura recalculada.",
                        )
                      }
                    >
                      Confirmar pago verificado
                    </button>
                  </div>
                ))}
            </div>
            {!overview.data.payments.some((p) => p.status === "pending_verification") && (
              <p className="text-sm text-slate-500">No hay pagos pendientes.</p>
            )}
          </div>
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Estas operaciones son administrativas. La habilitación de una suscripción todavía no
            reemplaza las pruebas de control de acceso ni el proceso tributario de emisión de
            facturas.
          </p>
        </>
      )}
    </section>
  );
}
