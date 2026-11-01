# Servicios, plazos de entrega y envío de órdenes de compra

Implementación sobre main restaurado, manteniendo la recepción de Bodega.

## Comportamiento

- Contactos permite proveedor de productos, servicios o ambos; plazo en días corridos. Proveedores históricos con servicios se clasifican según sus OC existentes. Revisar la clasificación en Contactos; no se inventan plazos.
- Los servicios de una OC aprobada se registran una vez por línea como ACEPTADO. No equivale a ejecución ni pago; no se insertan productos ni movimientos de stock. Servicios y Movimientos muestran el mismo registro, con filtros por proveedor y aprobación. La anulación actualiza su estado a ANULADO.
- Se conservan creación, aprobación, primer envío confirmado y recepción completa. OC históricas completas sin fecha exacta no reciben una fecha inventada.
- La OC copia el plazo del proveedor al crearse. Puede cambiarse por un usuario con edición de Compras antes del primer envío, desde el menú de trazabilidad. Los días se cuentan desde la fecha local de Santiago del primer envío confirmado. Recepciones parciales y reenvíos no reinician el plazo. Vencida significa fecha límite anterior a hoy y saldo de productos pendiente.
- Una OC aprobada conserva líneas, precios, condiciones, fechas y contenido contratado. Para cambiar el contrato, anular (si el flujo lo permite) y crear otra. Bodega puede recibir productos sin permiso para editar o aprobar compras.
- Servicios comparten los permisos de Compras; su registro dentro de Movimientos requiere permiso para ver Movimientos. Las consultas nuevas mantienen RLS. No se añade multitenencia ni se reinician datos.

## Despliegue

1. Aplicar `supabase/migrations/20261101065605_services_and_delivery.sql` al proyecto de esta aplicación. La migración es aditiva y se aplica una sola vez. El directorio antiguo `drizzle/migrations` sigue conservando el historial de instalación anterior: esta migración nueva no reemplaza sus tablas de base.
2. Desplegar la Edge Function `send-purchase-order`, incluyendo `deno.json`, con verificación JWT activada. Comprueba además la identidad del usuario y sus permisos en la base de datos.
3. Publicar el frontend del mismo commit en Vercel y actualizar VS Code desde main.

## Configuración de correo en Panel ADMINPRO

1. Entrar con la cuenta propietaria de la plataforma, perfil ADMINPRO y segundo factor verificado.
2. Registrar el dominio en la cuenta de Resend. Crear una clave con permisos de consulta/verificación de dominios y envío de correo.
3. Abrir **Panel ADMINPRO → Correo de órdenes de compra**. Ingresar el dominio exacto registrado (incluido subdominio si corresponde), un correo remitente perteneciente a ese mismo dominio y la clave privada.
4. Guardar la conexión. La conexión se valida contra Resend antes de guardar y el servicio queda inactivo. Para conservar la clave existente, dejar su campo vacío.
5. Copiar en el administrador DNS del dominio los registros mostrados en AdminPro. BodegaPro no altera el DNS ni registra dominios automáticamente.
6. Pulsar **Verificar dominio**. Si Resend todavía muestra un estado pendiente, esperar la propagación DNS y volver a verificar.
7. Solo con el dominio verificado para envío se habilita **Activar envío**. **Desactivar envío** funciona aunque Resend esté temporalmente fuera de servicio.

El remitente es compartido: la dirección guardada en AdminPro se conserva, pero el nombre visible es «Nombre legal de la empresa — vía BodegaPro». El nombre se toma de Configuración → Empresa, no del Nombre Panel. `reply_to` se toma del Correo de la empresa en esa misma configuración. El cuerpo del mensaje y el PDF también identifican a la empresa. No se envía si faltan su nombre o un correo de respuesta válido. La dirección compartida sigue visible en los detalles del correo.

### Seguridad y despliegue

- Migración `platform_email_configuration`: configuración y auditoría en esquema privado, con RLS y sin permisos de lectura o escritura para anon/authenticated. La clave se cifra mediante Supabase Vault. RPC internos de credenciales y actualización ejecutables únicamente con service_role; las fachadas públicas son SECURITY INVOKER y los ayudantes privilegiados están en private.
- Edge Function `platform-email-settings` con JWT obligatorio: valida sesión, claims firmados, AAL2, propietario actual y perfil ADMINPRO en cada operación. Devuelve una lista explícita de campos de estado, nunca la clave ni el identificador de Vault. Sin almacenamiento de credenciales en el cliente, logs de cuerpos o respuestas crudas de Resend.
- Escritura transaccional de clave/configuración y auditoría de actor, acción, fecha y versión. Control de revisión para evitar sobrescrituras entre sesiones concurrentes.
- `send-purchase-order` utiliza esta configuración del servidor y comprueba nuevamente el dominio en Resend antes de cada envío. Si el servicio está inactivo, no hay configuración o falla la verificación, no envía y registra el intento fallido.
- Desplegar ambas Edge Functions con JWT activado y sus respectivos `deno.json` (la función de configuración también incluye `config.ts`). La configuración comienza inactiva y vacía. Las variables antiguas `RESEND_API_KEY` y `PURCHASE_ORDER_FROM_EMAIL` ya no se usan como alternativa, para que no puedan eludir el interruptor de AdminPro.
- AdminPro administra una configuración para la instalación actual. Esto no incorpora aislamiento multiempresa.

El destinatario y contenido del PDF se consultan en el servidor desde la OC aprobada y su proveedor; el navegador no puede elegir otro destinatario ni marcar un envío como exitoso. Confirmación de Resend significa que el proveedor aceptó el correo; no garantiza entrega en la bandeja ni lectura. No se integra seguimiento de aperturas o webhooks de entrega en esta versión.

Se usa una clave de idempotencia por intento. Un intento en proceso o con resultado desconocido bloquea nuevos envíos de esa OC. Ante un corte, revisar el identificador de intento en Resend antes de resolverlo desde administración: nunca marcarlo como fallido ni reenviar sin verificar si ya fue aceptado. Los estados `processing` antiguos pueden indicar una interrupción; requieren la misma revisión. Solo el servidor, con service_role, puede actualizar el resultado. Un fallo de registro después de aceptación del proveedor queda pendiente de conciliación y no vuelve a enviar automáticamente.

## Verificación

- `npm test`: incluye fechas de Santiago, vencimiento en el día límite, parciales, completadas y servicios.
- `npx tsc --noEmit` y `npm run build`.
- `node scripts/tests/platform-email-settings.cjs`: Auth/DB/Resend simulados; propietario, perfil, MFA, ausencia de claves en respuestas, dominio, activación, desactivación, conflictos de versión y errores externos.
- `node scripts/tests/purchase-order-email.cjs`: Auth y correo simulados; PDF real multipágina, permisos, configuración faltante, respuestas fallidas, estado desconocido, idempotencia y destinatario tomado del servidor. No envía correos.
- Validación SQL con datos temporales y ROLLBACK: aceptación y anulación de servicios, stock sin cambios al aprobar, recepción parcial/completa como Bodega, exceso de recepción, bloqueo de modificación de contratos aprobados y falsificación de fechas, envío fallido, bloqueo concurrente y fecha límite en Santiago.

La prueba real de correo requiere configurar el dominio y enviar una OC a un destinatario autorizado desde la aplicación. No se enviaron correos durante las pruebas de implementación.
