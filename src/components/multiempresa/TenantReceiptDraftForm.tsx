import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { prepareReceiptBatch } from "@/lib/multiempresa/receipt-batch";
import {
  RECEIPT_WRITES_ENABLED,
  submitTenantReceiptBatch,
} from "@/lib/multiempresa/receipt-service";
import type { ReceiptBatchPayload } from "@/lib/multiempresa/receipt-batch";
import {
  validateReceiptDraft,
  validateReceiptDocument,
} from "@/lib/multiempresa/receipt-validation";

export type ReceiptDraftLine = {
  purchase_order_item_id: string;
  description: string;
  item_type: string;
  product_id: string | null;
  pending_quantity: number;
};

type Props = {
  companyId: string;
  orderId: string;
  lines: ReceiptDraftLine[];
};

export function TenantReceiptDraftForm({ companyId, orderId, lines }: Props) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [documentType, setDocumentType] = useState("guia");
  const [documentNumber, setDocumentNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [review, setReview] = useState(false);
  const [operationKey, setOperationKey] = useState(() => crypto.randomUUID());
  const [submittedPayload, setSubmittedPayload] = useState<ReceiptBatchPayload | null>(null);
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (payload: ReceiptBatchPayload) =>
      submitTenantReceiptBatch(payload, operationKey, queryClient),
    onSuccess: () => {
      setQuantities({});
      setDocumentNumber("");
      setNotes("");
      setReview(false);
      setSubmittedPayload(null);
      setOperationKey(crypto.randomUUID());
    },
  });
  const updateDraft = () => {
    setReview(false);
    if (submittedPayload) {
      // Freeze an uncertain failed network submission until the exact same payload is retried.
      return false;
    }
    return true;
  };

  // Never reuse a draft from another order or company.
  useEffect(() => {
    setQuantities({});
    setDocumentType("guia");
    setDocumentNumber("");
    setNotes("");
    setReview(false);
    setSubmittedPayload(null);
    setOperationKey(crypto.randomUUID());
  }, [companyId, orderId]);

  const receivable = useMemo(
    () =>
      lines.filter(
        (line) => line.item_type === "producto" && !!line.product_id && line.pending_quantity > 0,
      ),
    [lines],
  );
  const selected = receivable.filter(
    (line) => (quantities[line.purchase_order_item_id] ?? "").trim() !== "",
  );
  const quantityErrors = selected
    .map((line) =>
      validateReceiptDraft(quantities[line.purchase_order_item_id] ?? "", line.pending_quantity),
    )
    .filter((error): error is string => error !== null);
  const documentError =
    selected.length > 0 ? validateReceiptDocument(documentType, documentNumber) : null;
  const validDraft = selected.length > 0 && quantityErrors.length === 0 && documentError === null;
  const total = selected.reduce((sum, line) => {
    const value = Number(quantities[line.purchase_order_item_id]);
    return sum + (Number.isSafeInteger(value) && value > 0 ? value : 0);
  }, 0);

  const preview = validDraft
    ? prepareReceiptBatch(
        {
          companyId,
          orderId,
          documentType,
          documentNumber,
          notes,
          quantities: Object.fromEntries(
            selected.map((line) => [
              line.purchase_order_item_id,
              quantities[line.purchase_order_item_id] ?? "",
            ]),
          ),
        },
        lines,
      )
    : null;

  return (
    <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-base font-semibold">Preparar recepción</h3>
      <p className="mt-1 text-sm text-slate-600">
        Ingresa solo las cantidades que llegaron. Al registrar, el movimiento y el stock se
        actualizan juntos. Si ocurre un fallo de red, utiliza Reintentar para evitar duplicaciones.
      </p>
      {receivable.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">
          No hay productos de inventario pendientes de recepción en esta orden.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {receivable.map((line) => {
            const value = quantities[line.purchase_order_item_id] ?? "";
            const error = value.trim() ? validateReceiptDraft(value, line.pending_quantity) : null;
            return (
              <div
                key={line.purchase_order_item_id}
                className="grid gap-2 rounded-md bg-white p-3 sm:grid-cols-[1fr_10rem]"
              >
                <div className="text-sm">
                  <p className="font-medium">{line.description}</p>
                  <p className="text-slate-600">Pendientes: {line.pending_quantity}</p>
                </div>
                <div>
                  <label
                    htmlFor={`qty-${line.purchase_order_item_id}`}
                    className="block text-xs font-medium"
                  >
                    Cantidad recibida
                  </label>
                  <input
                    id={`qty-${line.purchase_order_item_id}`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={value}
                    placeholder="Ej.: 4"
                    disabled={save.isPending || !!submittedPayload}
                    onChange={(event) => {
                      if (!updateDraft()) return;
                      setQuantities((previous) => ({
                        ...previous,
                        [line.purchase_order_item_id]: event.target.value,
                      }));
                    }}
                    aria-invalid={!!error}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                  />
                  {error && (
                    <p role="alert" className="mt-1 text-xs text-red-700">
                      {error}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="receipt-document-type" className="block text-sm font-medium">
            Tipo de documento
          </label>
          <select
            id="receipt-document-type"
            value={documentType}
            disabled={save.isPending || !!submittedPayload}
            onChange={(event) => {
              if (updateDraft()) setDocumentType(event.target.value);
            }}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="guia">Guía de despacho</option>
            <option value="factura">Factura</option>
          </select>
        </div>
        <div>
          <label htmlFor="receipt-document-number" className="block text-sm font-medium">
            Número de documento
          </label>
          <input
            id="receipt-document-number"
            type="text"
            maxLength={60}
            value={documentNumber}
            placeholder="N° de documento"
            disabled={save.isPending || !!submittedPayload}
            onChange={(event) => {
              if (updateDraft()) setDocumentNumber(event.target.value);
            }}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      {documentError && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {documentError}
        </p>
      )}
      <label htmlFor="receipt-notes" className="mt-3 block text-sm font-medium">
        Observaciones (opcional)
      </label>
      <textarea
        id="receipt-notes"
        rows={2}
        maxLength={500}
        value={notes}
        disabled={save.isPending || !!submittedPayload}
        onChange={(event) => {
          if (updateDraft()) setNotes(event.target.value);
        }}
        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
        <p className="text-sm text-slate-700">
          {selected.length} producto(s) · {total} unidad(es)
          {validDraft ? " · Datos válidos para revisión" : " · Completa y revisa los datos"}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!preview}
            onClick={() => setReview((value) => !value)}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            {review ? "Ocultar revisión" : "Revisar recepción"}
          </button>
          <button
            type="button"
            disabled={!RECEIPT_WRITES_ENABLED || (!preview && !submittedPayload) || save.isPending}
            onClick={() => {
              const payload = submittedPayload ?? preview;
              if (!payload || save.isPending) return;
              setSubmittedPayload(payload);
              save.mutate(payload);
            }}
            className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {save.isPending
              ? "Registrando…"
              : submittedPayload
                ? "Reintentar misma recepción"
                : "Registrar recepción"}
          </button>
        </div>
      </div>
      {save.isError && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {save.error instanceof Error ? save.error.message : "No se pudo confirmar la recepción."}{" "}
          Reintenta sin modificar la solicitud. Si necesitas cambiarla, recarga la página y revisa
          antes si quedó registrada.
        </p>
      )}
      {save.isSuccess && (
        <p role="status" className="mt-3 rounded bg-teal-50 p-3 text-sm text-teal-900">
          Recepción registrada y stock actualizado. Historial y pendientes actualizados.
        </p>
      )}
      {review && preview && (
        <section
          aria-label="Revisión de recepción"
          className="mt-4 rounded border border-slate-200 bg-white p-3"
        >
          <h4 className="font-semibold">Resumen previo al registro</h4>
          <p className="mt-2 text-sm">
            Documento: {preview.p_document_type} N° {preview.p_document_number}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {preview.p_items.map((item) => (
              <li key={item.item_id}>
                {lines.find((line) => line.purchase_order_item_id === item.item_id)?.description ??
                  "Producto"}
                : {item.quantity} unidad(es)
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-600">
            Esta revisión no guarda información ni realiza movimientos de stock.
          </p>
        </section>
      )}
      <p className="mt-2 text-xs text-amber-800">
        Los movimientos se registran solamente para órdenes de productos aprobadas, bajo permisos de
        Bodega o Administración.
      </p>
    </div>
  );
}
