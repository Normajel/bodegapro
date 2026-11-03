import { useSyncExternalStore } from "react";

/**
 * Single in-memory tenant selection for read-only multi-company previews.
 * The value is UI state, not authorization: every API call must still
 * validate the authenticated membership and let PostgreSQL RLS enforce it.
 */
let currentCompanyId: string | null = null;
const listeners = new Set<() => void>();

export function publishActiveCompany(companyId: string | null): void {
  const next = companyId || null;
  if (currentCompanyId === next) return;
  currentCompanyId = next;
  for (const listener of listeners) listener();
}

export function getActiveCompany(): string | null {
  return currentCompanyId;
}

export function subscribeActiveCompany(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useActiveCompany(): string | null {
  return useSyncExternalStore(subscribeActiveCompany, getActiveCompany, () => null);
}
