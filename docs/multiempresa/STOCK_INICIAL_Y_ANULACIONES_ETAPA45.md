# Etapa 45 — Control de stock inicial y anulación con motivo (desarrollo)

## Stock inicial diferente de cero

Se añadió un trigger de inserción `tenant_opening_stock_authorization` sobre `public.products` en el Supabase **nuevo** (`vatpxpzdxstysvchyqqk`):
- Si el stock inicial es mayor que cero, exige sesión `authenticated`, MFA AAL2 y perfil ADMIN/ADMINPRO con membresía activa en la empresa correspondiente.
- Valida que `stock` y `stock_quantity` coincidan.
- Una inserción con stock inicial cero sigue permitida por esta regla, pero está sujeta a los permisos de creación de productos y políticas RLS.
- No existe todavía un formulario habilitado para crear productos: la regla previene futuras escrituras indebidas.

Prueba SQL reversible: Admin con MFA pudo insertar producto con stock 3; Bodega y Admin sin MFA fueron rechazados; inserción con stock 0 pasó. El ensayo terminó con `ROLLBACK` y no creó productos persistentes.

## Anulaciones de stock y ajustes

Esta etapa también preparó `cancel_tenant_stock_movement` con motivo y reversión atómica de movimientos aislados; creó `tenant_movement_cancellations` como historial inmutable y la nueva vista de anulaciones en Movimientos. Asimismo se preparó `adjust_tenant_inventory_stock` con motivo, stock entero y registro en `tenant_inventory_adjustments`.

**Las RPC no tienen EXECUTE para `authenticated`.** No se habilitarán anulaciones ni ajustes desde la web hasta comprobar Auth/MFA real, pertenencia a empresa, permisos y concurrencia.

No se puede anular de forma individual un movimiento que forma parte de una OC o lote. Las recepciones por OC necesitan su propia transacción de anulación con sus estados y cantidades pendientes.

## Pendientes

- Anulación de una OC completa, con reversión transaccional de recepciones y documento.
- Creación administrativa de productos y seguimiento de stock inicial con auditoría; separar el motivo del stock inicial de las recepciones.
- Ajustes de stock posteriores mediante nuevos registros de corrección sin reescribir el historial.
- Dashboard, gráficos y notificaciones de `main` adaptados a `company_id`.
- Pruebas funcionales de navegador con usuarios reales y despliegue independiente.

No se modificó Contemar ni `main`.
