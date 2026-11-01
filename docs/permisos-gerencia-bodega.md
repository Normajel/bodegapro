# Permisos de Gerencia y Bodega

Migración aplicada: 20261101193014_enforce_explicit_role_permissions.sql.

| Operación | GERENCIA | BODEGA |
|---|---|---|
| Consultar inventario, movimientos y OC | Sí | Sí |
| Aprobar OC | Sí | No |
| Crear, editar o anular compras | No | No |
| Recibir productos desde una OC aprobada | No | Sí |
| Editar o eliminar productos existentes | No | No |
| Editar o eliminar movimientos existentes | No | No |
| Crear entradas directamente en movimientos | No | No |
| Registrar salidas nuevas | No | Se conserva el permiso anterior |
| Enviar OC por correo | No | No |

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
