# Parche de ingresos independientes para BODEGA

Estado: BORRADOR PROPUESTO — NO APLICADO.

Este cambio aborda el bloqueo identificado en public.registrar_entrada_compra(): la función exigía purchases.create aunque el perfil BODEGA tiene movements.create.

El parche permite ejecutar la función cuando el usuario tiene movements.create o purchases.create, valida cantidades enteras y conserva la creación de purchase_entries, stock_movements y purchase_entry_items.

## Pendiente antes de aplicar
- Revisar el frontend en src/routes/_authenticated/movimientos.tsx: confirmar que el formulario y el botón Entrada también acepten movements.create.
- Validar permisos efectivos y políticas RLS de purchase_entries y purchase_entry_items.
- Probar en BodegaPro-Pruebas con JWT real de BODEGA y ADMIN.
- Confirmar que el trigger de stock y stock_quantity no provoque bloqueo ni doble actualización.
- Probar entradas independientes y recepción formal de OC por separado.
- No aplicar en producción.

Este archivo no cambia roles, políticas RLS, órdenes de compra ni la migración de recepciones v7.x.
