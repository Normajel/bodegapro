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

## Configuración de correo pendiente del propietario

En Supabase, Edge Functions → Secrets, configurar sin compartir claves en el chat ni en GitHub:

- `RESEND_API_KEY`: clave privada de Resend.
- `PURCHASE_ORDER_FROM_EMAIL`: remitente de un dominio verificado en Resend, por ejemplo `Compras <compras@tu-dominio.cl>`.

La integración usa Resend. Revisar su plan y verificar el dominio antes de usarla. Sin estas variables, la función no envía correo, registra intento fallido y no inicia el plazo. La clave no se utiliza en el navegador.

El destinatario y contenido del PDF se consultan en el servidor desde la OC aprobada y su proveedor; el navegador no puede elegir otro destinatario ni marcar un envío como exitoso. Confirmación de Resend significa que el proveedor aceptó el correo; no garantiza entrega en la bandeja ni lectura. No se integra seguimiento de aperturas o webhooks de entrega en esta versión.

Se usa una clave de idempotencia por intento. Un intento en proceso o con resultado desconocido bloquea nuevos envíos de esa OC. Ante un corte, revisar el identificador de intento en Resend antes de resolverlo desde administración: nunca marcarlo como fallido ni reenviar sin verificar si ya fue aceptado. Los estados `processing` antiguos pueden indicar una interrupción; requieren la misma revisión. Solo el servidor, con service_role, puede actualizar el resultado. Un fallo de registro después de aceptación del proveedor queda pendiente de conciliación y no vuelve a enviar automáticamente.

## Verificación

- `npm test`: incluye fechas de Santiago, vencimiento en el día límite, parciales, completadas y servicios.
- `npx tsc --noEmit` y `npm run build`.
- `node scripts/tests/purchase-order-email.cjs`: Auth y correo simulados; PDF real multipágina, permisos, configuración faltante, respuestas fallidas, estado desconocido, idempotencia y destinatario tomado del servidor. No envía correos.
- Validación SQL con datos temporales y ROLLBACK: aceptación y anulación de servicios, stock sin cambios al aprobar, recepción parcial/completa como Bodega, exceso de recepción, bloqueo de modificación de contratos aprobados y falsificación de fechas, envío fallido, bloqueo concurrente y fecha límite en Santiago.

La prueba real de correo requiere configurar el dominio y enviar una OC a un destinatario autorizado desde la aplicación. No se enviaron correos durante las pruebas de implementación.
