# Permisos de Gerencia y Bodega

Migración aplicada: 20261101193014_enforce_explicit_role_permissions.sql.

| Operación                                  | GERENCIA | BODEGA                          |
| ------------------------------------------ | -------- | ------------------------------- |
| Consultar inventario, movimientos y OC     | Sí       | Sí                              |
| Aprobar OC                                 | Sí       | No                              |
| Crear, editar o anular compras             | No       | No                              |
| Recibir productos desde una OC aprobada    | No       | Sí                              |
| Editar o eliminar productos existentes     | No       | No                              |
| Editar o eliminar movimientos existentes   | No       | No                              |
| Crear entradas directamente en movimientos | No       | No                              |
| Registrar salidas nuevas                   | No       | Se conserva el permiso anterior |
| Enviar OC por correo                       | No       | No                              |

Se conservan otros permisos no relacionados de Bodega, incluida su configuración previa de creación de productos y contactos. No se modifican cantidades, precios, recepciones ni documentos existentes.

## Autorización SQL

- has_app_permission devuelve siempre true o false. Sin sesión, perfil, módulo, acción, valor booleano verdadero o MFA exigido para administradores, devuelve false. Un string JSON con el texto "true" tampoco concede un permiso.
- Las diez funciones que contenían comprobaciones NOT has_app_permission se refuerzan con IS NOT TRUE. Se guardan sus definiciones completas para que la corrección pueda reproducirse en otra instalación.
- La aprobación se conserva como operación separada de editar Compras. Gerencia puede aprobar con permiso de lectura; ADMIN/ADMINPRO requieren los controles administrativos y MFA.
- La recepción de Bodega utiliza receive_purchase_order con validación de rol, permisos, OC aprobada, cantidades pendientes y documento. Su actualización interna de existencias y pendientes se ejecuta dentro de la operación autorizada.
- Una política RLS restrictiva impide entradas directas por la API a usuarios sin autorización administrativa. Las salidas conservan su autorización normal. La recepción privilegiada y validada por OC sigue funcionando.
- El envío de OC requiere edición de Compras. El rol de Gerencia no puede iniciar el envío por el solo hecho de poder aprobar.

## Verificación

- TypeScript, build de producción y 48 pruebas de aplicación.
- scripts/tests/explicit-role-permissions.sql verifica los RPC denegados para Gerencia/Bodega, RLS sobre edición y eliminación, aprobación real por Gerencia y recepción parcial/completa real por Bodega. Usa datos de prueba y ROLLBACK. Requiere una base de prueba autorizada con productos, proveedores y cuentas de los roles indicados.
- También comprueba el rechazo de entradas sin OC, MFA administrativo y permisos ausentes/perfiles inexistentes. No deja movimientos ni OC de prueba guardados.
- Tras actualizar, recargar la aplicación para obtener los permisos guardados de nuevo.

Esta corrección aborda los permisos que devolvían NULL y la configuración indicada de Gerencia/Bodega. Los demás hallazgos del informe de seguridad mantienen su revisión pendiente.

## Editor Roles y permisos

Configuración → Roles y permisos permite seleccionar un perfil existente y guardar únicamente sus permisos. Se retiraron el formulario de creación y el cambio de nombre. ADMIN puede editarlo únicamente el propietario ADMINPRO con segundo factor; ADMINPRO se muestra para consulta, con permisos protegidos; Configuración y Panel AdminPro se identifican como accesos reservados.

El listado incluye todas las áreas actuales y las acciones específicas de compras `approve`, `receive` y `send`. Las tres se verifican también en SQL. La migración conserva los accesos previos al inicializar las acciones nuevas. Servicios comparte el acceso de consulta de Compras. La anulación de documentos y el archivo de productos se identifican con sus nombres operativos.

Aprobar está disponible para Gerencia y administradores; recibir, para Bodega y administradores. El editor respeta estas restricciones, activa las dependencias necesarias al habilitar recepción o envío, y desactiva las acciones dependientes cuando se retira el permiso principal. Los administradores requieren segundo factor para sus operaciones. No se otorgan permisos adicionales a Gerencia o Bodega por instalar el nuevo editor.

Verificación: pruebas unitarias de acciones, restricciones y dependencias; pruebas SQL con ROLLBACK de revocación/habilitación de aprobación, recepción y envío, conservando MFA. Las pruebas SQL no modificaron inventario ni enviaron correos.

## Permisos de ADMIN editables por el propietario

En Configuración → Roles y permisos, el propietario ADMINPRO con segundo factor puede activar o desactivar las acciones de ADMIN. Los cambios afectan a todas las cuentas que comparten ese rol. ADMINPRO conserva su acceso y sus permisos no pueden modificarse desde el editor. La identidad de los roles predeterminados tampoco puede renombrarse o eliminarse.

ADMIN respeta los permisos booleanos almacenados; ya no conserva un acceso total implícito. La migración completa primero los permisos que antes eran implícitos, incluido Panel gerencial, manteniendo las capacidades iniciales. ADMIN conserva la obligación de segundo factor. No se modifican permisos operativos de otros perfiles; se materializa el acceso existente de Gerencia al Panel gerencial.

Para impedir que un administrador recupere permisos retirados, SQL bloquea la concesión de acciones que no posee al insertar/editar otros roles. La función autenticada `can_manage_role_members` solo permite administrar cuentas cuyos permisos no superen los del administrador, y la comprueban el servidor y las políticas de perfiles. Retirar Configuración también bloquea administración de usuarios y reinicio de datos en el servidor. Los ayudantes privilegiados están en private; la función pública es SECURITY INVOKER, sin acceso anónimo.

Pruebas SQL con ROLLBACK: edición por propietario, denegación sin MFA, revocación real de permisos, bloqueo de autoasignación y roles de evasión, protección de ADMINPRO, identidad inmutable y retiro de administración de cuentas. No se conservaron las modificaciones de prueba.
