/**
 * Client-side validation for a draft OC receipt.
 * Supabase must always repeat all authorization and quantity checks.
 */
export function validateReceiptDraft(
  input: string,
  pendingQuantity: number,
): string | null {
  if (!/^\d+$/.test(input.trim())) {
    return "Ingresa una cantidad entera positiva.";
  }
  const quantity = Number(input.trim());
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    return "La cantidad debe ser un entero mayor que cero.";
  }
  if (!Number.isSafeInteger(pendingQuantity) || pendingQuantity < 0) {
    return "La cantidad pendiente no es válida.";
  }
  if (quantity > pendingQuantity) {
    return "La cantidad supera las unidades pendientes.";
  }
  return null;
}
