# Etapa 51 — Programación inicial por módulo

## Implementación

Se incorporó programación individual de unidades de Producción por empresa, en la rama `multiempresa-desarrollo` y el Supabase independiente `vatpxpzdxstysvchyqqk`.

Los módulos ya creados por la aprobación de Notas de Venta pueden tener fecha, prioridad, área inicial, responsable de planificación y fecha del cambio. Las nueve áreas permitidas están alineadas con el flujo establecido: Estructura, Pintura, Carpintería, Piso linóleo, Circuito electrónico, Artefacto eléctrico, Fusión, Artefacto gasfitería y Detalle.

La función `plan_tenant_production_unit` permite programar o reprogramar módulos pendientes o programados, y genera una fila en `tenant_production_planning_events` con los valores anteriores y nuevos, el responsable y el motivo obligatorio. No se realizan cambios en inventario ni asignación de trabajadores.

## Permisos

Se incorporó el rol `JEFE_PRODUCCION` a las membresías de empresa, con índice único para un solo Jefe de Producción activo por empresa. Gerencia, Gerente, Admin, AdminPro y Jefe de Producción pueden utilizar la función, siempre que su membresía esté activa y tengan MFA AAL2.

La RPC tiene `EXECUTE` revocado a `public`, `anon` y `authenticated` hasta completar autenticación real y pruebas de navegador. La tabla del historial solo permite SELECT a miembros activos bajo RLS. Ningún usuario web tiene permisos de edición directa del historial o del cronograma.

## Interfaz

En el tablero de Producción se muestran área, prioridad y fecha programada. El formulario permite seleccionar una unidad y revisar una planificación con su fecha, prioridad, área y observaciones. **Guardar programación permanece deshabilitado**, ya que esta etapa prepara pero no libera las escrituras.

## Verificación

Prueba SQL con ROLLBACK: Gerencia programa; Jefe de Producción reorganiza y se crean dos registros históricos; se rechazan planes sin cambios, Bodega sin permisos y sesión sin MFA. El ensayo no dejó usuarios, NV ni unidades persistentes.

## Pendientes

- Cuentas reales y membresías por empresa, MFA, pruebas de navegador y concurrencia.
- Habilitación controlada del guardado de programación.
- Capacidad por área, orden de prioridad y disponibilidad de trabajadores.
- Registro de instalación por etapa, tiempo trabajado, pausas, asignaciones y entregas.
- Registro del cierre de cada etapa solo cuando la unidad cambie de área.
- Verificación final de CI y despliegue independiente.

Contemar y la rama `main` no fueron alterados.
