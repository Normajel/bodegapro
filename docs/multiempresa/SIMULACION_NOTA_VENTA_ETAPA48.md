# Etapa 48 — Simulación consolidada de una Nota de Venta con varios módulos

## Alcance

Se incorporó en el `Panel Gerencial` de INTEGRASTOCK Multiempresa una simulación **de solo lectura**, sin crear una Nota de Venta persistida. Una NV de prueba puede incluir varias unidades, cada una vinculada a una cubicación guardada normal o especial y con cantidad de módulos propia.

El formulario recibe un identificador de referencia de NV, pero **no se guarda** ni constituye un folio comercial real. Tampoco se crea una OC ni se reserva o descuenta inventario.

## Cálculo

1. Cada unidad selecciona su cubicación de la empresa activa, cuyas líneas se consultan con `company_id` y políticas RLS.
2. Se multiplican materiales por cantidad de módulos para cada unidad.
3. Los productos normales compartidos entre diferentes unidades se **suman antes de comparar su necesidad total con el stock una única vez**. Así se evitan duplicaciones de stock disponible.
4. Se calculan faltantes, costos de adquisición y costo estimado de materiales normales a precio unitario actual.
5. Los productos especiales no manejan stock: se agregan cantidades y costos de adquisición, sin inventar existencias.
6. Referencias de productos inactivos o no visibles se señalan, así como materiales sin costo positivo y precios incompatibles para un mismo producto especial.

El resultado muestra totales por NV y tablas consolidadas de materiales normales y especiales. El cálculo no considera mano de obra, impuestos, flete, reservas concurrentes, cronogramas ni tiempo de producción.

## Pruebas

`sale-simulator.test.ts` valida consolidación de materiales compartidos, una única comparación contra stock, costo de productos especiales, límites de unidades/módulos, precios especiales incompatibles y referencias de productos inexistentes.

## Seguridad y próximos pasos

- Los datos se consultan usando el selector de empresa existente y el control de roles gerenciales. No se ejecuta ninguna escritura SQL.
- El estado se reinicia al cambiar de empresa mediante la clave del componente React.
- No se ha activado el flujo real de creación de Nota de Venta ni la integración de su aprobación o despacho.
- Para una NV persistente se necesitará diseñar tablas por empresa, permisos de Ventas/Gerencia, edición trazable, snapshot de cubicaciones, conservación de precios, reservas y producción. Todo eso requiere pruebas con usuarios Auth reales.
- Pendiente comprobar la vista en navegador con documentos de prueba reales y el despliegue independiente.

Contemar, `main` y su base de datos no se modificaron.
