# Etapa 46 — Panel gerencial y notificaciones de Contemar, adaptados a Multiempresa

**Rama:** `multiempresa-desarrollo`; **origen:** `main` de Contemar, en modo lectura. No se hizo merge y no se alteró el Supabase original.

## Funcionalidad trasladada

- Se reemplazó la antigua ruta `/panel-gerencial` por `TenantManagementDashboard`, vinculada a la empresa seleccionada.
- La navegación muestra Panel Gerencial solamente a `ADMIN`, `ADMINPRO`, `GERENCIA` y `GERENTE`; las consultas se habilitan únicamente tras comprobar su membresía en la empresa.
- Tarjetas: inventario valorizado al costo unitario actual, productos activos, stock crítico, OC por aprobar, OC de productos pendientes de recepción, servicios `ACEPTADO`, entradas y salidas.
- Gráfico circular de valorización por categoría, gráfico de estados de las OC (sin mezclar productos y servicios) y flujo diario/acumulado de movimientos.
- Alertas amarillas separadas por perfil: Gerencia recibe OC por aprobar y stock crítico; Admin/AdminPro recibe OC pendientes de recepción y stock crítico. Los avisos se pueden descartar de la vista; el botón Actualizar vuelve a consultar y los vuelve a evaluar. No se han creado notificaciones push ni persistencia de descarte.
- Las consultas gerenciales usan `company_id` y las políticas RLS existentes. Las claves TanStack también incluyen la empresa. Al cambiar de empresa se limpia la caché.
- Los movimientos anulados individualmente se excluyen del flujo. El panel no convierte cantidades de movimientos en CLP cuando falta costo histórico; el gráfico está expresado en cantidades.
- Los movimientos consultan límites temporales de `America/Santiago`, respetando cambios de horario.
- Se agregaron consultas paginadas para evitar las 100 filas del historial de consulta o los límites silenciosos de 1000 filas de la API. Por seguridad se rechazan volúmenes superiores a los máximos soportados en vez de reportar sumas parciales.

## Validaciones añadidas

`src/lib/multiempresa/management-summary.test.ts` comprueba inventario valorizado, categorías, stock crítico, OC anuladas y flujo diario/acumulado. `management-alerts.test.ts` comprueba avisos de Gerencia, Admin y ausencia de avisos para Bodega y Ventas.

## Limitaciones y siguientes pasos

- Panel de solo lectura. La nueva base no tiene aún membresías de usuarios reales asignadas, por lo que las pruebas de navegador con Gerencia/Admin siguen pendientes.
- Para conjuntos de datos superiores a la paginación de seguridad habrá que implementar un resumen SQL agregado, en vez de elevar indefinidamente el límite del cliente.
- Las OC en el panel incluyen todos los registros disponibles, mientras que el filtro de fechas afecta los movimientos. Esto debe indicarse en la pantalla.
- El gráfico de entradas y salidas agrega cantidades registradas de distintas unidades de medida; no representa metros cúbicos ni un volumen físico homogéneo.
- Faltan el simulador de escenarios de cubicación, notificaciones persistentes por perfil y detalles finales de favicon/diseño.
- Verificar GitHub Actions en el commit final y despliegue independiente antes de liberar la vista a clientes.

**Todos los cambios se mantienen en el entorno multiempresa. Contemar y `main` continúan sin alteraciones.**
