# Etapa 45 — Anulaciones motivadas y correcciones de stock (Contemar → Multiempresa)

Fecha: 2026-11-05. Destino: rama `multiempresa-desarrollo` de `Normajel/bodegapro`. Supabase exclusivo: `vatpxpzdxstysvchyqqk`. No modificar `main` ni el proyecto Contemar.

## 1. Anulaciones de movimientos con motivo obligatorio

- Tabla `tenant_movement_cancellations`: empresa, movimiento original, producto, tipo, cantidad, motivo, responsable y fecha. Índice para historial por empresa y restricción única por movimiento.
- Función transaccional `cancel_tenant_stock_movement(company_id,movement_id,reason)`.
- Requiere Auth, MFA AAL2, membresía activa ADMIN o ADMINPRO y empresa activa. El motivo tiene entre 1 y 500 caracteres no vacíos.
- Mantiene el movimiento original (no lo elimina) y revierte la cantidad real en los dos campos compatibles `stock` y `stock_quantity`.
- Impide stock negativo al revertir entradas consumidas. Rechaza dobles anulaciones.
- No permite anular individualmente movimientos con `purchase_order_id`, `purchase_order_item_id` o `batch_id`: esos casos deben disponer de anulación del documento completo con trazabilidad propia.
- RLS de consulta: usuarios con membresía activa pueden distinguir movimientos anulados y consultar su motivo, sin consultar otras empresas. Ningún usuario web tiene INSERT/UPDATE/DELETE sobre el libro.
- En la pantalla de Movimientos se muestra `ANULADO` y un historial con el motivo. **El botón de anulación operativa NO está habilitado.**

## 2. Corrección administrativa de stock

- RPC `adjust_tenant_inventory_stock(company_id,product_id,new_stock,reason)`.
- Exige MFA AAL2, rol ADMIN/ADMINPRO, empresa y producto activos, cantidad entera no negativa, valor diferente al stock actual y motivo obligatorio.
- Bloquea el producto, actualiza ambos campos de stock e inserta el registro en `tenant_inventory_adjustments` dentro de una sola transacción.
- No crea una OC ni una recepción de compra ni modifica salidas.
- Historial por empresa y producto ya visible para Admin/AdminPro en Inventario. **No se habilitó la modificación de ajustes previos ni el botón operativo de corrección**; hay que probar la semántica de reajustar un registro anterior frente a movimientos posteriores antes de implementarla.

## 3. Seguridad y habilitación

`authenticated` no tiene `EXECUTE` sobre las dos RPC nuevas. Ambas están preparadas pero cerradas al frontend hasta pruebas reales Auth/MFA, RLS con cuentas de dos empresas y verificación de concurrencia. La validación de formularios en `stock-audit.ts` también usa un bloqueo explícito `STOCK_AUDIT_WRITES_ENABLED=false`.

## 4. Pruebas SQL reversibles

Se ejecutaron con cuentas de simulación y `ROLLBACK`:
- Registrar una entrada de prueba, anularla y comprobar stock restaurado y motivo registrado.
- Rechazar doble anulación, entradas con consumo posterior y anulaciones de movimientos vinculados a OC.
- Anular una salida y luego una entrada en secuencia: stock final 0.
- Rechazar intentos desde Bodega, otras empresas y sin MFA AAL2.
- Ajuste desde Admin con motivo e historial, rechazo de Bodega, empresa ajena, decimales y corrección sin cambios.

No se persistieron los datos usados en estos ensayos.

## 5. Próximas transferencias pendientes desde `main`

1. Anulación **de compras completas** (incluye movimientos enlazados) con reversión de recepciones y estados de OC, no borrado individual.
2. Ajustar o corregir registros históricos de ajuste de stock preservando los movimientos posteriores y evitando stock negativo.
3. Restricción y control de stock inicial distinto de cero al crear productos.
4. Indicadores gerenciales, gráficos actualizados y notificaciones de Contemar adaptados a `company_id`.
5. Favicon gráfico original y últimos ajustes visuales.
6. Validaciones con usuarios Auth reales, permisos cambiantes y despliegue independiente.

La ejecución de GitHub Actions de este conjunto debe comprobarse sobre el último commit formateado.
