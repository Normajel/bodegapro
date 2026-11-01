# Último costo de compra y servicios contratistas

El costo unitario del inventario se actualiza al registrar la entrada o recepción de productos, con o sin OC. Aprobar una OC aún no recibida no modifica stock ni costo. Se guarda el precio unitario, no el total de la factura.

La sincronización ocurre en la misma transacción de la compra, mediante funciones privadas sin acceso de ejecución para anon ni authenticated. Se consideran los movimientos de entrada y las líneas de compras vigentes. El orden es fecha de registro y folio; editar una compra antigua no la convierte en la compra más reciente. Un precio cero es válido. Las salidas y los servicios no constituyen compras de inventario.

Las compras históricas con líneas y movimientos desincronizados se reparan usando sus propios precios originales. El inventario toma el precio de la última compra válida; al anularla o eliminarla se recupera la anterior, si existe. Sin compras válidas restantes se conserva la última valorización conocida. No se recalculan cantidades ni se reescriben precios de movimientos históricos al cambiar el precio actual del producto.

En Contactos se distinguen Proveedores (productos) y Contratistas (servicios). Un contacto puede cumplir ambas funciones. Nuevo contratista inicia con el tipo servicios y no requiere plazo de entrega de productos. La planilla Servicios contratistas muestra los servicios contratados mediante OC y permite filtrar por contratista. ACEPTADO significa aprobado, no ejecutado ni pagado.

Se mantienen las claves y relaciones existentes (supplier_kind=servicios o ambos), por lo que no se duplican contactos ni se pierden órdenes anteriores. Esta modificación pertenece al ERP Bodega, sin implementar los procesos de ejecución de IntegraStock Producción.

Validación: scripts/tests/latest-purchase-inventory-cost.sql verifica entradas, edición de compras actuales y antiguas, salida, eliminación, anulación, precio cero, sincronización del precio de líneas con movimientos y conservación de cantidades. Se ejecuta con rollback.
