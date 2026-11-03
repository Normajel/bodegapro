# Regla definitiva — Órdenes de compra sin mezclas

INTEGRASTOCK Multiempresa admite únicamente dos tipos excluyentes de órdenes de compra:

1. **Productos** (`order_kind='producto'`): productos normales y especiales; su recepción sigue las reglas de stock aplicables.
2. **Servicios** (`order_kind='servicio'`): servicios aceptados por Gerencia; registro en `accepted_services`, **sin movimientos de stock**.

**No existe el tipo de OC mixta**. No debe ofrecerse en formularios, filtros, reportes ni rutas de aprobación.

## Seguridad de datos

En Supabase multiempresa (`vatpxpzdxstysvchyqqk`):
- `purchase_orders.order_kind` es obligatorio, solo acepta `producto` y `servicio`; las órdenes antiguas de demostración son de productos.
- El tipo de una OC no se puede modificar después de crearla. Para cambiarlo se debe crear otra orden.
- Un trigger comprueba el tipo de cada línea contra el de su OC, incluyendo modificaciones, y serializa los cambios a través de un bloqueo de la OC para evitar combinaciones concurrentes.
- El servicio de aceptación y la recepción física usan funciones independientes, aún sin EXECUTE para usuarios web.

## Pruebas SQL (reversibles)

Se verificó: orden de servicios con líneas de servicios aceptada; producto rechazado dentro de OC de servicios; servicio rechazado dentro de OC de productos; cambio del tipo de la OC rechazado. Todos los ensayos pasaron y terminaron con `ROLLBACK`.

## Interfaz

El catálogo consulta `order_kind` directamente desde `purchase_orders`. Se eliminó el clasificador provisional de OC mixta y su aviso. Las órdenes de servicio no presentan el formulario de recepción física.

**Pendiente:** desarrollar el formulario de creación de nuevas OC para seleccionar Producto o Servicio desde el principio. La rama `main` y Contemar no se modifican.
