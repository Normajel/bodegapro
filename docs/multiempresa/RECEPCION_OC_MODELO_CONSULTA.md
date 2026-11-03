# Etapa 27 — Modelo de consulta para recepciones de OC

Proyecto: INTEGRASTOCK Multiempresa. Contemar no fue modificado.

## Cambios aplicados en Supabase
- Restricción `tenant_po_received_bounds` en `public.purchase_order_items`: `received_quantity >= 0 AND received_quantity <= quantity`.
- Vista de solo lectura `public.tenant_purchase_order_receipt_progress` con `security_invoker=true`; devuelve `company_id`, OC, línea, producto, tipo, descripción, cantidades solicitada, recibida y pendiente.
- Permiso SELECT sobre la vista para authenticated; las tablas subyacentes conservan sus políticas RLS.

## Comprobaciones
El catálogo PostgreSQL confirmó la restricción y la opción `security_invoker=true`. La base no tenía órdenes para ensayar una recepción real. No se creó RPC de recepción ni se activó escritura desde frontend.

## Pendientes
Función transaccional aprobada para OC con validación de estado y de membresías, actualización simultánea de línea/stock/movimiento, idempotencia vinculada a la misma recepción, bloqueo de concurrencia y pruebas con sesiones Auth reales. No confundir este modelo de lectura con una recepción funcional.
