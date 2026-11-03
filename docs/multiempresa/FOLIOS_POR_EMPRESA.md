# Etapa 26 — Folios consecutivos por empresa

Se creó `public.tenant_movement_counters` con un contador por empresa, RLS activada y sin permisos directos para `anon` ni `authenticated`. El trigger `trg_assign_tenant_movement_folio` asigna el folio de `stock_movements` en la misma transacción, con actualización serializada por el conflicto sobre la clave de empresa.

Se eliminó el carácter IDENTITY global del campo `folio`. Las inserciones manuales con un folio explícito quedan rechazadas. La restricción única `(company_id,folio)` sigue activa.

**Prueba SQL reversible:** empresa A folio 1; empresa B folio 1; empresa A folio 2. Se ejecutó ROLLBACK.

**Pendientes:** prueba de concurrencia con conexiones paralelas, ejecución bajo sesiones Auth reales y pruebas de recepción desde OC. El RPC de movimientos sigue bloqueado para `authenticated`, por lo que no se habilita el formulario operativo.
