# Plan de respaldo y pruebas aisladas — BodegaPro

**Estado:** preparación, no ejecutado. **NO ejecutar migración v6 en producción.**

## Requisitos
- Windows con Docker Desktop activo, Node.js y Supabase CLI mediante `npx supabase`.
- Una base PostgreSQL local de pruebas, independiente de la instancia alojada.
- Respaldo privado verificable de producción (NO subir datos, contraseñas ni dumps a GitHub).
- Confirmar versión de PostgreSQL y extensiones antes de restaurar.
- Guardar los respaldos fuera del repositorio y proteger su acceso.

## Paso 1 — Respaldo (PC local)
1. Obtener conexión de respaldo desde el panel de Supabase; no pegar secretos en el chat.
2. Usar una herramienta `pg_dump` compatible con la versión del servidor.
3. Respaldar esquema y datos con formato personalizado, por ejemplo:
   `pg_dump --format=custom --no-owner --no-acl --file=bodegapro_pre_migracion.dump "<CONEXION_PRIVADA>"`
4. Verificar que el archivo existe, tiene tamaño razonable y que `pg_restore --list bodegapro_pre_migracion.dump` lo puede leer.
5. Mantener también copia del esquema y registro de versiones. El respaldo de PostgreSQL no incluye necesariamente todos los recursos de Supabase Auth/Storage: inventariar sus dependencias.
6. Nunca ejecutar restauraciones sobre producción.

## Paso 2 — Entorno aislado
1. Instalar/abrir Docker Desktop; ejecutar `docker version`.
2. Desde una carpeta separada del proyecto productivo, ejecutar `npx supabase init` (solo si no está inicializada).
3. Ejecutar `npx supabase start`; comprobar `npx supabase status`.
4. **No ejecutar `supabase link` ni `supabase db push` contra producción.**
5. Restaurar una copia de prueba a PostgreSQL local, después de comprobar que versión, extensiones, roles, esquemas auth/storage y políticas coinciden. La restauración de un dump remoto en Supabase local puede requerir ajustes y NO debe asumirse automática.
6. Verificar conteos de productos, órdenes, líneas y movimientos; comprobar identidades de prueba sin reutilizar sesiones reales.

## Paso 3 — Auditoría de la migración v6 antes de ejecutarla
- **Bloqueador:** el nuevo rol `oc_receipt_executor` necesita permisos efectivos de ejecución de `auth.uid()`, `public.has_app_permission` y de las funciones invocadas por triggers; revisar `USAGE` de esquemas y secuencias.
- **Bloqueador:** validar que `CREATE ROLE` y `ALTER FUNCTION ... OWNER TO` estén permitidos por el rol administrador de la instancia; no asumir superusuario.
- **Bloqueador:** verificar que las políticas RLS para el rol técnico no permitan lecturas/escrituras más amplias de lo necesario, y que ninguna sesión cliente pueda asumirlo.
- **Bloqueador:** revisar que las funciones `SECURITY DEFINER` de entrada/edición/anulación no eludan los nuevos triggers; comprobar también `anular_compra`, `reset_business_data` y las funciones de stock.
- **Bloqueador:** verificar las restricciones y triggers de `purchase_order_items` y `purchase_orders`, incluyendo cambios de OC aprobada, cierre y anulación.
- **Bloqueador:** la v6 contiene políticas `CREATE POLICY` sin `DROP POLICY IF EXISTS`; reejecutar podría fallar. Requiere estrategia idempotente o ejecutar una sola vez en DB recién restaurada.
- **Bloqueador:** verificar que el rol propietario no necesite permisos adicionales para las llamadas `auth.uid()`, RPC y triggers.
- **Bloqueador:** no confundir cantidades `numeric` con fracciones; probar 0, enteros, decimales, negativos, duplicados y excedentes.

## Paso 4 — Matriz de pruebas
| Caso | Resultado esperado |
|---|---|
| BODEGA recibe OC aprobada parcialmente | OK; stock y recibido aumentan una vez |
| BODEGA recibe OC no aprobada | Denegado |
| GERENCIA intenta recibir OC | Denegado, salvo permiso futuro explícito |
| ADMIN/ADMINPRO reciben OC aprobada | OK con MFA/permisos efectivos |
| Inserción directa de movimiento con IDs formales OC | Denegada |
| Entrada independiente con referencia OC de texto | OK, sin vínculo formal |
| Editar/anular movimiento vinculado a OC desde Movimientos | Denegado |
| Editar/anular movimiento independiente permitido | OK |
| Recibir dos veces o exceder pendiente | Denegado |
| Actualizar `received_quantity` desde cliente | Denegado |
| Eliminar línea con cantidades recibidas | Denegado |
| Cerrar recepción completa y parcial | Estados correctos |
| Dos recepciones simultáneas | Sin duplicación ni sobre-recepción |
| Guardar, editar y anular entradas independientes | Sin regresiones |
| Reversión ante fallo de trigger | Sin cambios parciales |

## Paso 5 — Criterio de aprobación
No autorizar instalación en producción hasta: respaldo restaurable comprobado; migración ejecutada en base aislada; todas las pruebas críticas aprobadas con JWT de usuarios de prueba; revisión de RLS/roles; y plan de reversión documentado.

**Importante:** esta guía es preparación. No demuestra que exista ya un respaldo ni que las pruebas hayan pasado.
