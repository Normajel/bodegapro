/**
 * Frontend validation mirrors the staged SQL rules.
 * Security remains enforced by PostgreSQL, not these client-side helpers.
 */
export const STOCK_AUDIT_WRITES_ENABLED = false;

export function validateAuditReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (!trimmed) return "Indica el motivo obligatorio de la operación.";
  if (trimmed.length > 500) return "El motivo no puede superar 500 caracteres.";
  return null;
}

export function validateAdjustedStock(input: string): string | null {
  const trimmed = input.trim();
  if (!/^(0|[1-9][0-9]*)$/.test(trimmed)) {
    return "Ingresa un stock entero igual o mayor a cero.";
  }
  const number = Number(trimmed);
  if (!Number.isSafeInteger(number) || number > 1_000_000_000) {
    return "La cantidad excede el rango permitido.";
  }
  return null;
}

export type MovementCancellationCandidate = {
  purchase_order_id: string | null;
  purchase_order_item_id: string | null;
  batch_id: string | null;
  alreadyCancelled: boolean;
};

export function canPrepareMovementCancellation(movement: MovementCancellationCandidate): boolean {
  return (
    !movement.alreadyCancelled &&
    !movement.purchase_order_id &&
    !movement.purchase_order_item_id &&
    !movement.batch_id
  );
}
