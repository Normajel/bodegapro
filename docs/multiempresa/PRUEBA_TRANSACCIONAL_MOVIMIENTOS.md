# Pruebas transaccionales de movimientos — Etapa 23

Proyecto: Supabase INTEGRASTOCK Multiempresa. Contemar no fue modificado.

Se ejecutó una transacción SQL con una empresa, usuario temporal vinculado a `auth.users`, membresía ADMIN y producto temporal, con `request.jwt.claim.sub` y `request.jwt.claim.role` simulados. La función `public.record_tenant_stock_movement` se probó dentro de la transacción.

## Resultados
- Entrada de 10 unidades: stock pasó a 10 — SUPERADO.
- Repetición con la misma `operation_key`: devolvió el mismo ID y stock permaneció en 10 — SUPERADO.
- Salida de 3: stock pasó a 7 — SUPERADO.
- Intento de salida de 8 con 7 disponibles: error y stock quedó en 7 — SUPERADO.

Se ejecutó `ROLLBACK`; verificación posterior: 0 empresas, 0 productos, 0 movimientos, 0 membresías, 0 usuarios Auth. `authenticated` no tiene permiso EXECUTE sobre la función.

## Limitaciones
Pruebas ejecutadas vía SQL con contexto JWT simulado, no mediante sesiones reales, API REST ni frontend. Falta prueba cruzada de empresas A/B, competencia concurrente, consistencia del folio por empresa y actualización de recepción de órdenes de compra. **No habilitar aún al frontend.**
