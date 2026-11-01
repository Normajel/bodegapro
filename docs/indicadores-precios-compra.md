# Indicadores de precios de compra

Las flechas comparan precios unitarios netos del mismo producto y unidad entre compras efectivamente registradas, sin restringir el proveedor:

- Verde hacia abajo: precio menor que en la compra anterior.
- Amarilla hacia la derecha: mismo precio, comparado a dos decimales.
- Roja hacia arriba: precio mayor.
- Guion: no existe una compra anterior comparable; nunca se presenta como precio mantenido.

Se muestran en la última compra de Inventario, precio unitario de entradas en Movimientos, formulario e historial de compras, vista previa de movimientos, líneas de productos en OC y formulario de recepción. El título accesible de la flecha incluye ambos precios. En Inventario se conserva el costo de valorización y se identifica por separado el valor de la última compra; no se cambia la valorización del inventario.

El historial combina movimientos de entrada y compras antiguas de purchase_entry_items. Se excluyen compras anuladas, salidas y ajustes sin datos de compra. Los registros enlazados no se duplican ni se recuperan movimientos eliminados. Se admiten precios cero válidos. Se consulta por páginas, sin cortar el historial en los primeros 5000 registros.

Las recepciones parciales de una misma OC se agrupan como una sola compra por producto y unidad, con fecha de su primera recepción: una entrega posterior no altera el orden de compras. Si el mismo documento incluye varias líneas del mismo producto y unidad, se calcula su precio unitario promedio ponderado por cantidad para la comparación siguiente. Cada movimiento conserva su propio precio en pantalla.

Se normalizan mayúsculas, espacios y equivalencias directas conocidas, como UN/unidad, MT/metro y LT/litro. No se convierten cajas a unidades ni se comparan envases diferentes. Los servicios sin identidad de producto de inventario no reciben comparaciones automáticas por coincidencia de descripción.

No hay cambios de esquema, permisos ni precios almacenados. Se reutiliza la sesión y RLS de Supabase. Ante un fallo de consulta se informa que el historial no está disponible. Las consultas se invalidan al registrar/editar compras o recibir productos y también se refrescan periódicamente.

Verificación: TypeScript, compilación de producción y suite de 42 pruebas (incluye 11 casos de comparación, anulación, unidades, cero, fuentes combinadas y recepciones parciales). Consultas de historial comprobadas con identidad Bodega, sin modificar datos.
