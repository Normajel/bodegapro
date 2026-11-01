# Verificación de anulación de órdenes de compra

Fecha: 2026-10-31. Inspección de la definición real de `public.cancel_purchase_order(uuid)` en Supabase (solo lectura).

## Comportamiento confirmado

- Exige una sesión autenticada (`auth.uid()`).
- Bloquea la fila de la orden con `FOR UPDATE`.
- Solo permite anular si `status = 'pendiente'` y ninguna línea tiene `received_quantity > 0`.
- Cambia `purchase_orders.status` a `anulada`; **no** borra movimientos ni revierte stock.
- La función no contiene una comprobación explícita de permiso de compras: **pendiente** revisar permisos EXECUTE y políticas RLS de UPDATE para comprobar que un usuario sin permiso no pueda anular.

## Implicaciones

La corrección de una recepción registrada debe ser un proceso separado, auditado y transaccional. No se debe reutilizar `cancel_purchase_order` para revertir stock de una recepción.

## Casos de prueba pendientes

1. BODEGA: recepcionar OC aprobada; denegar anulación no autorizada.
2. GERENCIA: aprobar OC y no alterar cantidades recibidas.
3. ADMIN: anular OC pendiente sin recepciones.
4. Todos: rechazar anulación de OC con recepción parcial o completa.
5. Rechazar edición o eliminación directa de movimiento vinculado a una línea de OC.
6. Permitir entradas excepcionales sin OC y salidas normales con permisos correspondientes.

No se ejecutó SQL de escritura ni se modificó producción.
