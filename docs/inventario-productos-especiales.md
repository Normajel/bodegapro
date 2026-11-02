# Inventario de productos especiales

Funcionalidad integrada en `/productos-especiales`, Cubicación, Documento de cubicación y Órdenes de compra. Acceso al catálogo e historial: roles ADMIN, VENTA/VENTAS y ADMINPRO. Se conserva el segundo factor y la verificación de propietario para los perfiles administrativos.

## Uso paso a paso

1. Abrir **Inventario especial → Ingresar nuevo producto especial**. Completar descripción, categoría, unidad, proveedor de referencia, costo de referencia, código de barras/QR y ubicación. Los campos comunes comparten el tipo `ProductDetails`, las unidades y el componente de descripción con el inventario general. No hay campos de stock ni stock mínimo porque este catálogo no controla existencias.
2. Guardar. Supabase asigna un SKU único `ESP` más seis dígitos mediante una secuencia segura ante altas simultáneas. Los números pueden tener saltos; nunca se calcula un SKU contando filas. Crear un producto no equivale a registrar una compra.
3. En **Cubicación**, activar **Especial**. Buscar por descripción o SKU. El selector completa categoría, unidad y costo de referencia. Ingresar la cantidad y ajustar el costo de la planilla si corresponde.
4. Si no existe el producto, pulsar **+**. El modal permite darlo de alta sin salir de la planilla; al guardar queda registrado y seleccionado inmediatamente. Al cerrar se desmonta solo el formulario, que vuelve vacío en la siguiente apertura. Cliente, unidad, orden de venta, selección general y costos de la planilla se conservan.
5. **Guardar plantilla** guarda atómicamente tanto materiales generales como especiales y registra el uso de los especiales. **PDF/Imprimir** registra la versión actual del documento antes de generar su salida. El mismo UUID se conserva mientras está abierta esa planilla: guardar y volver a imprimir/PDF reemplaza sus líneas en lugar de sumar copias.
6. **Documento de cubicación** también recupera los especiales guardados y los incluye en el cálculo y PDF. Los especiales se muestran en amarillo y sin stock; el PDF incluye solo la descripción.
7. En **Órdenes de compra**, elegir **Tipo de línea → Producto especial (sin stock)**. Buscar el producto; **Consultar compras, proveedores y uso** muestra sus antecedentes sin perder el borrador de la OC. Se puede combinar un producto general, uno especial y servicios en una misma orden.
8. Aprobar y recibir por el flujo existente. La recepción especial conserva fecha de compra, proveedor, cantidad, costo unitario, costo total neto, OC y factura/guía. Las recepciones parciales y completas actualizan el pendiente de la OC. Los especiales nunca generan entradas en `products` ni movimientos de stock.
9. En el catálogo, pulsar **Ver compras y uso**. Se distinguen OC solicitadas, compras efectivamente recibidas y cantidades incluidas en cubicaciones.

## Datos y trazabilidad

| Estructura                                | Propósito                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `special_products`                        | Maestro independiente, SKU ESP y datos de referencia                                                 |
| `purchase_order_items.special_product_id` | Asociación inequívoca de la línea de OC al catálogo especial                                         |
| `special_product_receipts`                | Historial de recepción y costos reales; proveedor conservado como referencia e instantánea de nombre |
| `cubication_special_items`                | Especiales de cada plantilla preestablecida                                                          |
| `special_cubication_documents`            | Documento con UUID, cliente, unidad, OV y configuración de costos                                    |
| `special_cubication_lines`                | Cantidad y costo de cada especial por documento                                                      |

La fecha de compra se obtiene de la **fecha de la OC**. `received_at` conserva además el momento real de recepción. Los costos de compra son **netos**, en coherencia con las líneas actuales de OC; su IVA sigue calculándose a nivel de orden. El costo total se calcula en la base de datos como cantidad × costo unitario. Cada compra y cada recepción parcial conserva sus propios valores; no se reescribe el historial al cambiar el costo de otra OC.

Las cantidades de cubicación corresponden al **uso planificado registrado en la planilla**; no certifican ejecución o consumo físico. Una nueva apertura de una planilla crea otro documento; la deduplicación cubre las acciones repetidas dentro del mismo documento abierto. Para estadísticas por trabajo ejecutado se necesita vincular posteriormente el documento a una orden de producción o consumo confirmado.

## Código y conexión

- `special-product-modal.tsx`: alta inmediata y formulario reutilizable, sobrepuesto mediante portal, con reinicio al desmontar.
- `special-product-selector.tsx`: búsqueda por descripción/SKU, teclado, selección y alta mediante +.
- `use-special-products.ts`: catálogo paginado desde Supabase y consulta de historial.
- `special-product-history.tsx`: tablas de compras recibidas, OC y uso planificado.
- `productos-especiales.tsx`: página independiente con búsqueda, paginación e historial.
- `cubication-window.tsx`: integración, preservación de campos y guardado de planilla con especiales.
- `documento-cubicacion.tsx`: lectura e impresión de la plantilla completa.
- `compras.tsx`: selección de especiales e historial durante la creación de OC.
- Migración `20261102182108_special_product_catalog.sql`: tablas, índices, claves, RLS y extensión de los RPC existentes.

Las líneas mantienen `item_type='producto'`, identificadas por **uno solo** de `product_id` o `special_product_id`. Esto conserva aprobación, plazos y resumen de recepciones de productos. La recepción especial se escribe en su propia tabla; los productos normales conservan su función original.

Se corrige también el permiso histórico de plantillas: se valida `cubication.edit/view`, en lugar de exigir permisos de edición de Movimientos a Ventas. Los permisos del catálogo se incluyen en Roles y permisos. No se concede acceso al catálogo a Gerencia o Bodega; Bodega sí puede recibir los especiales descritos en una OC aprobada mediante el RPC de recepción existente.

## Seguridad y comprobaciones

Todas las tablas nuevas tienen RLS y privilegios explícitos. No hay acceso anónimo. El historial de compras usa una función interna con privilegios elevados y una entrada pública acotada; vuelve a verificar el usuario, rol y permiso antes de devolver datos. Esta elevación es deliberada para que Ventas consulte solo el historial especial sin habilitarle todas las compras o el inventario general. Las escrituras de recepción se hacen exclusivamente desde el flujo de recepción autorizado.

Validación realizada:

```bash
npm ci --no-audit --no-fund
npx tsc --noEmit
npm test
npm run build
npx eslint src/components/special-product*.tsx src/components/product-description-field.tsx src/hooks/use-special-products.ts src/lib/product-form.ts src/lib/special-products.ts src/components/cubication-window.tsx src/routes/_authenticated/productos-especiales.tsx src/routes/_authenticated/productos.tsx src/routes/_authenticated/compras.tsx src/routes/_authenticated/documento-cubicacion.tsx src/lib/permissions.ts src/lib/cubication-pdf.ts src/test/special-products-ui.test.tsx
```

`supabase/tests/special_product_catalog.sql` se ejecuta en una transacción que termina con ROLLBACK. Comprueba SKU, permisos de Admin/Ventas/Bodega/Gerencia, una OC mixta, recepción parcial y completa, proveedor, costos, stock general intacto para especiales, persistencia de plantilla e idempotencia del documento. No deja filas de prueba. Las secuencias pueden avanzar durante la prueba aunque se reviertan las filas.

Los tests de interfaz comprueban búsqueda y selección por teclado, alta inmediata, reinicio del modal sin borrar la planilla, conservación de datos ante un error y UUID estable al repetir PDF y guardar.

## Categorías y unidades de medida

El modal **Nuevo producto especial** utiliza listas desplegables compartidas para Categoría y Unidad de medida, tanto desde el catálogo como desde Cubicación o una OC. Ventas solo selecciona opciones habilitadas; no puede escribir valores libres ni cambiar los parámetros.

Admin y AdminPro disponen de **Administrar categoría / Administrar unidad de medida**. Pueden agregar opciones, renombrar la opción seleccionada o desactivarla. Los cambios se conservan en `special_product_parameters` y se comparten con los demás usuarios. Renombrar o desactivar una opción no reescribe productos ni compras históricas.

La migración `20261102184129_special_product_parameters.sql` carga las opciones iniciales y conserva las categorías/unidades previamente utilizadas. RLS restringe los cambios de parámetros a Admin/AdminPro, respetando MFA. Un trigger valida los valores de cada producto especial, por lo que Ventas tampoco puede enviar opciones inexistentes mediante una petición directa a la API.

Pruebas: `supabase/tests/special_product_parameters.sql` comprueba administración por Admin, lectura y selección por Ventas, rechazo de modificaciones no autorizadas y rechazo de categorías/unidades inexistentes. Las pruebas de interfaz verifican los dos desplegables y la edición administrativa.

El SKU ESP se muestra únicamente en el inventario especial. Los selectores, descripciones de OC, planillas y PDF presentan solo el nombre del producto. Las OC antiguas que incorporaron el SKU como prefijo se muestran sin ese prefijo, manteniendo su vínculo original al producto.
