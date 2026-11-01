# Panel Gerencial

Ruta `/panel-gerencial`. Primera versión conectada a los registros existentes; no requiere migraciones ni modifica datos.

## Acceso

Solo roles asignados ADMIN, GERENCIA y GERENTE. Los nombres de usuario Admin_1 y Gerencia_1 heredan acceso del rol asignado, no del nombre. ADMINPRO, BODEGA y VENTAS quedan excluidos. La consulta del servidor vuelve a comprobar rol y permisos; ADMIN requiere AAL2. Se usa el JWT del solicitante y se conservan las políticas RLS. Las cuatro áreas de origen deben permitir lectura; una restricción produce error en vez de mostrar totales parciales. El permiso `management.view=false` permite deshabilitar el panel para un rol admitido desde la matriz de permisos. Este permiso nunca habilita otros roles.

## Indicadores y filtros

- Fechas de Chile, máximo un año, inclusivas. Aplican a movimientos y a la fecha de las OC, no al inventario actual.
- Categoría y producto aplican a inventario, movimientos y cubicaciones. Las OC permanecen filtradas solo por fecha.
- Stock valorizado: stock_quantity (stock como respaldo) por unit_cost actual; solo productos activos. No se suman cantidades de unidades distintas.
- Flujos diarios y ranking: cantidad por costo histórico guardado en el movimiento. Incluyen ajustes y reversas del registro; no son ventas ni compras netas facturadas. Los costos ausentes se excluyen de la valorización y se informa su cantidad.
- OC: anuladas excluidas. Estado actual de órdenes creadas en el período seleccionado; no es el total de pendientes de todos los períodos.
- Cubicación: elegir una plantilla; calcula materiales y faltantes teóricos para una unidad del modelo. Agrega cantidades de un mismo producto antes de descontar el stock una vez. No suma plantillas como si fueran demanda confirmada. No incluye reservas, compras en tránsito, costos manuales del documento ni ejecución por obra.
- Detalle de inventario desplegable y selección de categoría mediante el gráfico.
- Consultas paginadas de 1000 registros, actualización cada minuto y al volver a la ventana; botón manual. Errores, datos vacíos y costos incompletos visibles.

## Evolución pendiente de datos estructurados

Consumo real por obra, comparación de presupuesto y ejecución, demanda futura, reservas y costos adicionales requieren documentos persistidos con proyecto, estado, fecha y vínculos con salidas/compras. No deben inferirse de las plantillas actuales. El análisis detallado por proveedor y precios históricos puede ampliarse sobre el historial vigente una vez definida la exclusión de documentos anulados y reversas.

## Verificación

Pruebas de cálculos, fechas de Chile, faltantes, costos históricos y autorizaciones. Prueba del servidor para petición directa de Bodega, MFA de Admin y permisos insuficientes. Ejecutar `npm test`, `npx tsc --noEmit` y `npm run build`.
