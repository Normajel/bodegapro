# Registro manual de envío de una OC

En Órdenes de compra → acciones (…) → OC enviada · registrar manualmente se registra un envío que ya se realizó fuera de la aplicación. También se puede abrir desde Historial / plazo de entrega.

Se informa fecha y hora de Chile, destinatario o contacto, medio (correo externo, WhatsApp, entrega presencial u otro), plazo en días corridos y observaciones. El usuario confirma que el envío ya ocurrió. Esta operación no envía mensajes ni afecta stock o recepciones.

La acción requiere OC aprobada y no anulada, y los permisos existentes purchases.view/edit/send. Admin conserva MFA. El servidor valida los datos, registra al autor y bloquea fechas futuras o anteriores a la aprobación, cambios directos de fecha y reenvíos que pretendan alterar el plazo. Si hay un correo en proceso o por verificar, se debe resolver antes de registrar un envío manual.

El primer envío registrado activa sent_at y sent_to y permite calcular la fecha límite según el plazo. Un reenvío agrega historial pero no cambia el primer envío ni reinicia el plazo. El historial distingue el estado manual de sent (aceptado por el servicio de correo), sin inventar una confirmación del proveedor de correo. Muestra tanto la fecha declarada del envío como la fecha en que se registró la declaración.

Los intentos de correo fallidos conservan su historial pero no activan sent_at. Ningún envío manual histórico se agrega automáticamente: los registra un usuario autorizado. Las solicitudes repetidas conservan un único evento mediante una clave de idempotencia.

Validación: scripts/tests/manual-purchase-dispatch.sql verifica con rollback el primer envío, fecha límite, autoría, idempotencia, reenvío, fechas futuras, bloqueo de modificación directa y permisos. Las pruebas de interfaz comprueban confirmación, cancelación sin escrituras y plazo bloqueado al reenviar. Las pruebas de zona horaria cubren horario de verano e invierno de Chile y fechas inválidas.
