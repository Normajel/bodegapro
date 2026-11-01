# Notificaciones por perfil

La campana aparece en todas las páginas del panel para perfiles ADMIN, GERENCIA y GERENTE. AdminPro y Bodega no reciben estos avisos. Admin_1 y Gerencia_1 los reciben cuando son usuarios asignados a los roles ADMIN y GERENCIA correspondientes.

- Gerencia: «Debe aprobar órdenes de compra pendientes.» cuando hay OC por aprobar no anuladas; «Hay productos bajo stock.» si existe algún producto activo en o bajo su mínimo, incluido sin stock.
- Admin: «Hay productos no recepcionados.» cuando hay líneas de productos pendientes en OC aprobadas aún abiertas o parciales; «Hay productos bajo stock.» con el mismo criterio.

No se consideran recepciones pendientes los servicios, las OC anuladas, las no aprobadas ni las cerradas completas. La alerta de stock no incluye nombres, identificadores ni un listado de productos, y no enlaza al inventario.

La consulta a Supabase devuelve únicamente tres booleanos. La función comprueba la sesión y el rol desde profiles/app_roles en el servidor y mantiene AAL2 para Admin. No concede acceso a tablas de inventario a perfiles que no lo tengan. La autorización de aprobación y recepción existente no se modifica.

Los avisos nuevos aparecen separados en amarillo y pueden cerrarse tocando el texto, usando la X o deslizando hacia los lados o arriba. La campana cuenta notificaciones sin leer, no tipos de pendientes activos. Se pueden marcar individualmente o todas como leídas. Los avisos leídos dejan de contar y se pueden consultar con Ver avisos leídos mientras el pendiente exista. Leer o cerrar un aviso no modifica compras ni stock. El estado leído se guarda en el navegador por usuario y perfil, sin mezclar sesiones; si el almacenamiento no está disponible, funciona en memoria. Se consultan cada 30 segundos con la aplicación activa y al volver a ella. El mismo aviso no se repite en cada consulta ni al recargar después de leerlo. Puede volver a aparecer si se resuelve y después surge nuevamente. Las acciones llevan a OC filtradas por aprobar o a Recepciones; el aviso de stock solo puede marcarse como leído, sin mostrar productos. El botón Actualizar permite consultar de inmediato. Son notificaciones internas, sin correo ni push con la aplicación cerrada.

Validación: compilación de producción, ESLint y pruebas de selección de avisos por perfil y formato sin detalles. Pruebas de interfaz verifican la campana, ausencia de repeticiones, reactivación después de resolver pendientes y error de consulta. scripts/tests/role-notifications.sql verifica los filtros contra los datos reales, aislamiento por rol, MFA y rechazo de acceso anónimo, dentro de una transacción con rollback.
