import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCompanyProducts, listCompanySuppliers, tenantQueryKeys } from "@/lib/multiempresa/tenant-catalog";
import { prepareNewOrder, type NewOrderDraft, type NewOrderLine, type PurchaseOrderKind } from "@/lib/multiempresa/new-order";

const blankLine = (): NewOrderLine => ({
  productId: "",
  description: "",
  unit: "unidad",
  quantity: "",
  unitCost: "",
});

const clp = (value: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);

/** Draft-only UI. No mutation and no RPC is invoked by this component. */
export function TenantNewOrderDraft({ companyId }: { companyId: string }) {
  const [kind, setKind] = useState<PurchaseOrderKind>("producto");
  const [supplierId, setSupplierId] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("contado");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<NewOrderLine[]>([blankLine()]);
  const [showReview, setShowReview] = useState(false);

  const suppliers = useQuery({
    queryKey: tenantQueryKeys.suppliers(companyId),
    queryFn: () => listCompanySuppliers(companyId),
    staleTime: 0,
  });
  const products = useQuery({
    queryKey: tenantQueryKeys.products(companyId),
    queryFn: () => listCompanyProducts(companyId),
    staleTime: 0,
  });

  const suppliersAvailable = (suppliers.data ?? []).filter((supplier) =>
    supplier.supplier_kind === "ambos" ||
    (kind === "producto" ? supplier.supplier_kind === "productos" : supplier.supplier_kind === "servicios"),
  );
  const productsAvailable = (products.data ?? []).filter((product) => product.active);

  const draft: NewOrderDraft = { companyId, kind, supplierId, orderNumber, paymentTerms, notes, lines };
  let prepared: ReturnType<typeof prepareNewOrder> | null = null;
  let errorMessage: string | null = null;
  if (suppliers.isSuccess && products.isSuccess) {
    try {
      prepared = prepareNewOrder(draft, suppliers.data, products.data);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Revisa los datos de la orden.";
    }
  }
  const updateLine = (index: number, patch: Partial<NewOrderLine>) => {
    setShowReview(false);
    setLines((previous) => previous.map((line, i) => i === index ? { ...line, ...patch } : line));
  };

  return (
    <section aria-label="Nueva orden de compra" className="mb-8 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold">Preparar nueva orden de compra</h2>
      <p className="mt-1 text-sm text-slate-600">
        Borrador de prueba. No se guarda ni se envía a Gerencia. Las OC de productos y servicios son independientes.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="block text-sm font-medium">
          Tipo de OC
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as PurchaseOrderKind);
              setSupplierId("");
              setLines([blankLine()]);
              setShowReview(false);
            }}
            className="mt-1 w-full rounded border border-slate-300 bg-white p-2"
          >
            <option value="producto">Productos</option>
            <option value="servicio">Servicios</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          N° de OC
          <input
            value={orderNumber}
            maxLength={60}
            onChange={(event) => { setOrderNumber(event.target.value); setShowReview(false); }}
            placeholder="Ej.: OC-2026-001"
            className="mt-1 w-full rounded border border-slate-300 p-2"
          />
        </label>
        <label className="block text-sm font-medium">
          Proveedor
          <select
            value={supplierId}
            onChange={(event) => { setSupplierId(event.target.value); setShowReview(false); }}
            className="mt-1 w-full rounded border border-slate-300 bg-white p-2"
          >
            <option value="">Seleccionar proveedor</option>
            {suppliersAvailable.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Condiciones de pago
          <input
            value={paymentTerms}
            maxLength={100}
            onChange={(event) => { setPaymentTerms(event.target.value); setShowReview(false); }}
            placeholder="Contado o 30 días"
            className="mt-1 w-full rounded border border-slate-300 p-2"
          />
        </label>
      </div>
      {(suppliers.isPending || products.isPending) && (
        <p role="status" className="mt-3 text-sm">Cargando catálogo de la empresa…</p>
      )}
      {(suppliers.isError || products.isError) && (
        <p role="alert" className="mt-3 text-sm text-red-700">No se pudieron cargar proveedores o productos.</p>
      )}
      <h3 className="mt-5 font-semibold">Detalle de {kind === "producto" ? "productos" : "servicios"}</h3>
      {lines.map((line, index) => (
        <div key={index} className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-5">
          {kind === "producto" ? (
            <label className="text-xs font-medium lg:col-span-2">
              Producto del inventario
              <select
                value={line.productId}
                onChange={(event) => {
                  const product = productsAvailable.find((item) => item.id === event.target.value);
                  updateLine(index, {
                    productId: product?.id ?? "",
                    description: product?.name ?? "",
                    unit: product?.unit ?? "unidad",
                  });
                }}
                className="mt-1 w-full rounded border border-slate-300 bg-white p-2 text-sm"
              >
                <option value="">Seleccionar producto</option>
                {productsAvailable.map((product) => (
                  <option key={product.id} value={product.id}>{product.sku} — {product.name}</option>
                ))}
              </select>
            </label>
          ) : (
            <label className="text-xs font-medium lg:col-span-2">
              Descripción del servicio
              <input
                value={line.description}
                maxLength={250}
                onChange={(event) => updateLine(index, { description: event.target.value })}
                className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
              />
            </label>
          )}
          <label className="text-xs font-medium">
            Unidad
            <input
              value={line.unit}
              disabled={kind === "producto"}
              maxLength={50}
              onChange={(event) => updateLine(index, { unit: event.target.value })}
              className="mt-1 w-full rounded border border-slate-300 p-2 text-sm disabled:bg-slate-100"
            />
          </label>
          <label className="text-xs font-medium">
            Cantidad
            <input
              value={line.quantity}
              inputMode="numeric"
              placeholder="Ej.: 2"
              onChange={(event) => updateLine(index, { quantity: event.target.value })}
              className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
            />
          </label>
          <label className="text-xs font-medium">
            Precio unitario (CLP)
            <input
              value={line.unitCost}
              inputMode="numeric"
              placeholder="Ej.: 15000"
              onChange={(event) => updateLine(index, { unitCost: event.target.value })}
              className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
            />
          </label>
          {lines.length > 1 && (
            <button
              type="button"
              onClick={() => { setLines((previous) => previous.filter((_, i) => i !== index)); setShowReview(false); }}
              className="text-left text-sm font-medium text-red-700"
            >Quitar línea</button>
          )}
        </div>
      ))}
      <button
        type="button"
        disabled={lines.length >= 100}
        onClick={() => { setLines((previous) => [...previous, blankLine()]); setShowReview(false); }}
        className="mt-3 rounded border border-slate-300 px-3 py-2 text-sm font-semibold"
      >Agregar línea</button>
      <label className="mt-4 block text-sm font-medium">
        Observaciones
        <textarea
          value={notes}
          maxLength={500}
          rows={2}
          onChange={(event) => { setNotes(event.target.value); setShowReview(false); }}
          className="mt-1 w-full rounded border border-slate-300 p-2"
        />
      </label>
      {errorMessage && <p className="mt-3 text-sm text-amber-800">{errorMessage}</p>}
      {prepared && (
        <div className="mt-4 text-sm text-slate-700">
          Neto: {clp(prepared.netTotal)} · IVA 19%: {clp(prepared.vatAmount)} ·
          <strong> Total: {clp(prepared.totalAmount)}</strong>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!prepared}
          onClick={() => setShowReview((old) => !old)}
          className="rounded border border-teal-600 px-4 py-2 text-sm font-semibold text-teal-800 disabled:opacity-50"
        >{showReview ? "Ocultar revisión" : "Revisar borrador"}</button>
        <button
          type="button"
          disabled
          title="Guardado pendiente de validación con usuarios Auth reales"
          className="cursor-not-allowed rounded bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
        >Crear OC (próximamente)</button>
      </div>
      {showReview && prepared && (
        <div className="mt-4 rounded border border-teal-200 bg-teal-50 p-3 text-sm">
          <strong>Resumen de OC {prepared.orderNumber}</strong>
          <p>Tipo: {prepared.kind === "producto" ? "Productos" : "Servicios"} · Líneas: {prepared.items.length}</p>
          <p>Proveedor: {suppliers.data?.find((item) => item.id === prepared.supplierId)?.name}</p>
          <p>Total con IVA: {clp(prepared.totalAmount)}. La revisión no modifica la base de datos.</p>
        </div>
      )}
    </section>
  );
}
