# Auditoría y plan de corrección: recepciones y seguridad

Fecha: 2026-10-31. Revisión de solo lectura sobre Supabase y GitHub. **No ejecutar SQL ni desplegar sin pruebas.**

## Evidencia comprobada

- RLS está activado en las 17 tablas públicas observadas.
- `public.approve_purchase_order` delega en `private.approve_purchase_order`, que exige `public.can_approve_purchase_orders()`; hay un trigger `guard_purchase_order_approval`.
- `receive_purchase_order` bloquea órdenes sin aprobación y bloquea cantidades que excedan lo pendiente, pero no valida que `p_lines` tenga identificadores de línea únicos. Dos apariciones de la misma línea podrían superar la cantidad pendiente dentro de una sola llamada: cada iteración consulta `received_quantity` actualizado, por lo que se debe probar el comportamiento real antes de modificarlo.
- `require_approved_purchase_order_receipt` valida la aprobación solamente cuando `stock_movements.purchase_order_id` no es nulo. Entradas sin vínculo siguen siendo posibles según permisos.
- `registrar_entrada_compra` permite entradas sin orden vinculada si el usuario tiene permiso de compras/create.
- `save_movement_batch` permite entradas/salidas y edición de lotes con las políticas RLS aplicables.
- La función de recepción guarda `quantity_value = receive_quantity`, pero `quantity = greatest(1, round(receive_quantity)::integer)`. El trigger de stock usa `quantity`: riesgo de diferencias para cantidades fraccionarias.
- `purchase_orders` y `purchase_order_items` permiten UPDATE con permiso purchases/edit. La aprobación tiene trigger específico, pero otras columnas sensibles requieren revisión.
- El asesor de seguridad Supabase muestra 15 funciones SECURITY DEFINER ejecutables por authenticated y protección de contraseñas filtradas desactivada. Estas alertas requieren evaluación individual, no revocación indiscriminada.

## Cambios propuestos, por orden

1. Definir si los movimientos admiten cantidades fraccionarias; no cambiar semántica de stock hasta decidirlo y comprobar los triggers.
2. Validar `p_lines` antes de recepcionar: cada item_id una sola vez, cantidades positivas y enteras si ésa es la regla comercial, existencia de la línea y correspondencia con la OC. Rechazar duplicados de manera atómica.
3. Confirmar que sólo el RPC de recepción puede modificar `received_quantity`, y que los cambios de líneas y campos esenciales tras aprobación requieren flujo controlado.
4. Para entradas excepcionales sin OC, diseñar permiso específico y registro de motivo; no bloquear BODEGA_1 sin validar su flujo real.
5. Definir idempotencia de recepciones (clave de solicitud única) para proteger contra doble clic y reintentos. No usar sólo el número de guía como clave, porque una guía puede incluir varias líneas.
6. Revisar cada función SECURITY DEFINER y activar protección de contraseñas filtradas si está disponible en el plan.

## Pruebas requeridas

- ADMIN/GERENCIA: aprobación válida; BODEGA_1: aprobación denegada.
- BODEGA_1: recepción parcial y completa de OC aprobada.
- OC por aprobar/anulada/completa: recepción denegada.
- Cantidad superior al pendiente, cero, negativa y duplicación del mismo item_id en p_lines: denegadas sin movimiento ni cambio de stock.
- Dos solicitudes simultáneas y reintento de la misma recepción: sin duplicar existencias.
- Entrada excepcional autorizada vs. no autorizada.
- Actualización/edición de una OC aprobada: no alterar cantidades, aprobaciones ni historial sin autorización.
- Comparar antes/después: products.stock, stock_movements, purchase_order_items.received_quantity y purchase_orders.status.

## Despliegue

Preparar migración versionada y pruebas en entorno de prueba, revisar resultados, luego desplegar en ventana controlada. Conservar script de reversión y respaldo. No ejecutar modificaciones parciales en producción.

Este documento registra hallazgos y pasos; **no representa una corrección ya aplicada**.
