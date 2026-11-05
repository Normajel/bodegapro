# Etapa 47 — Simulador gerencial de cubicaciones por empresa

Implementado en `multiempresa-desarrollo`, sin cambios en `main` ni en el Supabase original de Contemar.

## Flujo de consulta

En `/panel-gerencial`, Administración y Gerencia pueden seleccionar una unidad guardada (cubicación normal o especial), ingresar una cantidad entera de 1 a 1000 módulos y ver una **simulación sin persistencia**. La consulta se filtra por `company_id` y se rige por RLS de membresía activa. No crea, reserva ni descuenta stock.

### Cubicaciones normales

- Agrupa los materiales del documento por producto, incluyendo líneas repetidas, y calcula cantidades requeridas para los módulos.
- Compara con el stock disponible de esa empresa.
- Informa el máximo de módulos fabricables **simultáneamente** según el material limitante y muestra las cantidades faltantes.
- Calcula costos estimados usando precios unitarios actuales y señala costos faltantes.
- Gráfico de cobertura valorizada: materiales que están en stock frente a materiales por adquirir, considerando solo materiales con precio registrado.
- Identifica referencias eliminadas o inactivas y evita presentar capacidad de fabricación si existen materiales no disponibles.
- Muestra un detalle de cada material y sus cantidades por módulo, necesarias, disponibles, faltantes y costo.

### Cubicaciones especiales

Los productos especiales no llevan stock por definición. El simulador calcula la cantidad a adquirir y su costo estimado para el número solicitado de módulos, sin afirmar que exista inventario ni calcular módulos posibles con stock.

## Pruebas y límites

- Tests unitarios: suma de líneas repetidas, máximo de módulos por material limitante, faltantes y costos; referencias desconocidas; materiales sin precio; validación de cantidad; tratamiento correcto de productos especiales.
- Consulta de documentos y materiales solamente de la empresa seleccionada; referencias integridad mediante FK compuesta y políticas RLS ya existentes.
- El catálogo se limita a 1000 documentos por tipo y el detalle a 1000 líneas por documento; si se supera el límite se produce error, no resultados truncados.
- Las cifras de costos son estimaciones al costo actual, sin incluir flete, mano de obra, IVA ni disponibilidad contractual. No reemplazan cotizaciones ni reservas de bodega.
- Las simulaciones de normal y especial son independientes. La planificación real de una venta que combine distintos módulos requiere agregación de necesidades entre unidades, que queda pendiente.

## Pendientes

- Pruebas en navegador con perfiles reales vinculados a las dos empresas DEMO.
- Reporte descargable de escenario, exportación e integración futura con Nota de Venta.
- Si hay grandes volúmenes, reemplazar límites de lectura por funciones SQL agregadas con autorización.
- Completar despliegue independiente y habilitar progresivamente las operaciones de compra y recepción tras pruebas Auth.
