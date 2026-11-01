# Validación estática de migración de recepción (2026-10-31)

Fuente: definiciones reales de funciones y triggers en Supabase (consultas solo lectura) y archivo docs/sql-propuesto/migracion_recepcion_oc_bodega_v1.sql.

## Triggers inspeccionados

- guard_purchase_order_approval: bloquea nuevas aprobaciones sin can_approve_purchase_orders(). La recepción no cambia approval_status.
- require_approved_purchase_order_receipt: exige approval_status='aprobada' cuando stock_movements.purchase_order_id está definido.
- actualizar_stock_movimiento: en INSERT suma quantity al stock de products, o resta en salida. No se debe duplicar la actualización en la RPC.
- recalculate_purchase_order_totals: AFTER UPDATE de purchase_order_items actualiza net_total, vat_amount y total_amount de la OC mediante SECURITY DEFINER, incluso si solo cambia received_quantity. Se debe evaluar el impacto en locks, auditoría y permisos.

## Bloqueantes para aprobar despliegue

1. Falta probar con JWT real BODEGA, GERENCIA, ADMIN, ADMINPRO, y con OC aprobada y stock inicial conocido.
2. La RPC candidata SECURITY DEFINER necesita revisión del propietario, EXECUTE, RLS y protección contra UPDATE directo de received_quantity, stock_movements y status de OC.
3. La función valida cantidades no negativas, enteras, duplicados y pendiente, pero debe probar casos extremos, desbordamientos numéricos y concurrencia.
4. Comprobar que los triggers de recálculo no generen efectos inesperados al modificar received_quantity.
5. Verificar que todas las entradas por Movimientos y Compras sigan siendo compatibles; no fusionar ni ejecutar todavía.

## Resultado

Validación estática parcial favorable de triggers; NO hay pruebas funcionales ejecutadas ni autorización de despliegue. Ninguna modificación en Supabase o main.
