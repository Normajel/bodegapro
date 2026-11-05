# Transferencia selectiva de cambios Contemar → INTEGRASTOCK Multiempresa

Fecha de revisión: 5 de noviembre de 2026. Origen: rama `main` del repositorio `Normajel/bodegapro`. Destino: `multiempresa-desarrollo`. **No se efectuó merge automático y no se editó `main` ni la base de Contemar.**

## Incorporado al desarrollo multiempresa

1. **Identidad visual de la aplicación.** Nuevo título de pestaña INTEGRASTOCK Multiempresa, etiqueta para dispositivo móvil y manifiesto PWA con inicio en `/compras`. El favicon binario nuevo de `main` todavía no se transfirió; se conserva el archivo existente.
2. **Historial de ajustes de inventario.** Nueva tabla `tenant_inventory_adjustments` con empresa, producto, stock anterior y corregido, motivo y fechas. Validaciones de cantidades enteras, FK conjunta empresa-producto, índices y RLS: solo roles `ADMIN` y `ADMINPRO` con membresía activa en la empresa pueden consultar el historial. `authenticated` no puede actualizar o insertar. Vista de consulta integrada a Inventario. **No hay función que genere registros nuevos ni modificación operativa del stock.**
3. **Chat privado por empresa (base + pantalla).** Tablas `tenant_chat_messages`, `tenant_chat_clears` y `tenant_chat_role_settings`; RLS para sender/recipient y membresías activas, verificación segura de destinatarios y RPC `tenant_chat_contacts`. Pantalla asociada al selector de empresa: contactos, contador no leídos, botón Leer, envío de mensajes y X para ocultar del historial personal. Los contactos se identifican provisionalmente por rol e ID corto; nombres completos legibles requieren catálogo de usuarios por empresa. La tabla de permisos inicia vacía/deshabilitada.
4. **Permisos del chat.** Vista de permisos en el selector solo para Admin/AdminPro, sin controles de escritura habilitados. RPC `set_tenant_chat_role_access` preparada, exige perfil administrador y MFA AAL2, pero su EXECUTE permanece revocado a `authenticated` hasta pruebas reales.
5. **Documentos de cubicación.** Nuevo visor de unidades normales y especiales guardadas, segregado por empresa, de solo lectura e independiente de permisos de creación/edición de cubicaciones. La ruta `/documento-cubicacion` se habilitó en el entorno de consulta y dejó de montar el módulo heredado de Contemar.

## Verificaciones realizadas

- Prueba SQL reversible de ajustes: Admin de empresa A ve solo sus ajustes; Bodega de B ve cero. `UPDATE` de ajustes no está concedido.
- Prueba SQL reversible del chat: envío dentro de A, lectura de remitente y destinatario, usuario de B sin acceso, rechazo de destinatario de otra empresa. **PASS** tras adaptar la verificación del destinatario a una función protegida, sin abrir acceso general a las membresías.
- Las pruebas temporales SQL utilizaron `ROLLBACK` y no dejaron mensajes ni ajustes ni membresías adicionales.
- El proyecto independiente mantiene las dos empresas DEMO. Existe una cuenta Auth, pero no tiene membresías asignadas; no se considera prueba de autenticación real multiempresa.
- La compilación y los cinco GitHub Actions deben verificarse para el commit final de esta transferencia.

## Pendiente de portar / validar

- Las nuevas reglas de **anulación obligatoriamente motivada, estados de OC, eliminación de movimientos y documentos** de `main`: requieren revisar cada RPC y adaptar su lógica a `company_id`. **No se deben copiar las migraciones antiguas a la base multiempresa sin revisión.**
- **Corrección editable de stock ajustado**: sigue bloqueada hasta disponer de una operación transaccional segura y auditada que no se confunda con recepción o salida.
- **Nombre visual, favicon ICO actualizado y resto de retoques de interfaz**: requieren portado específico; la identidad textual sí está aplicada.
- **Permisos de chat operativos**: comprobar MFA real de Admin y sesiones Auth por empresa antes de habilitar configuraciones y pruebas de uso del chat.
- **Documentos de cubicación**: verificar vista completa y exportación PDF con datos reales; la etapa actual permite consultar unidades guardadas y líneas.
- **Otras mejoras del panel gerencial y notificaciones**, que necesitan adaptación al nuevo esquema de indicadores por empresa.
- Crear cuentas de prueba reales y validar RLS y concurrencia con API/navegador.

La rama `main` de Contemar sigue siendo la fuente de referencia, no un destino de modificaciones.

## Actualización de transferencia — 5 de noviembre de 2026

- **Documento de cubicación guardado**: se completó el visor de la empresa, con nombres reales de productos normales y especiales, cantidades, stock de productos normales, costos unitarios, subtotales, fecha, cliente/tipo de unidad/referencia editables solo para la presentación, y descarga PDF de consulta. Los productos especiales se muestran correctamente como **sin stock**. No se concede permiso de edición de cubicaciones ni se realizan cambios en inventario al generar el PDF.
- **Corrección de ajustes históricos de stock**: se implementó un mecanismo más seguro que editar la fila histórica. La tabla `tenant_inventory_adjustment_corrections` vincula el ajuste original, motivo, responsable, fecha y stock anterior/nuevo; su función `correct_tenant_inventory_adjustment` recalcula únicamente el stock **actual** en una transacción y conserva intactos los movimientos y ajustes históricos. Esta función exige Admin/AdminPro, empresa activa y MFA AAL2 y mantiene `EXECUTE` revocado a clientes web hasta pruebas reales. Un trigger rechaza UPDATE/DELETE en los eventos de corrección.
- **Historial de Administración**: la vista de ajustes de inventario también muestra las correcciones posteriores vinculadas al ajuste original, sin habilitar botones de escritura.
- **Pruebas**: se ensayó con `ROLLBACK` la corrección de stock actual, la inmutabilidad del ajuste original y el rechazo de Bodega, otra empresa o una sesión sin MFA.
- **Pendiente**: no se copió el favicon ICO binario original, porque su transferencia requiere un mecanismo binario verificado. Las pruebas con Auth real y el despliegue independiente también siguen pendientes.

Esta adaptación fue aplicada únicamente a `multiempresa-desarrollo` y al Supabase nuevo `vatpxpzdxstysvchyqqk`; no se modificaron `main` ni la base de Contemar.
