# Auditoría integral multiempresa — etapa 32
Fecha: 2026-11-02. Rama: multiempresa-desarrollo. Original Contemar y main no modificados.

## Verificado en esta sesión
- Supabase nuevo: 0 empresas, productos, órdenes y movimientos.
- Analizador de seguridad: 5 avisos INFO (cuatro tablas privadas billing y tenant_movement_counters), sin nuevas advertencias severas reportadas en esta consulta.
- Funciones record_tenant_stock_movement y receive_tenant_purchase_order_item mantienen EXECUTE revocado al rol authenticated según verificaciones previas.
- Inspeccionados: package.json, TenantReceiptPreview, TenantOrdersPreview, tenant-catalog, CompanySelector, __root y ruta autenticada.

## Correcciones en GitHub
- src/routes/_authenticated/route.tsx: se retiró consulta heredada de profiles y AppShell; beforeLoad verifica sesión y membresía de nueva empresa y rechaza rutas distintas de /productos, /contactos, /compras y /movimientos.
- src/components/multiempresa/CompanySelector.tsx: se limpia la caché de React Query antes de publicar un cambio de empresa y se valida que la selección pertenezca a la lista cargada.

## Pendientes críticos de validación
1. Ejecutar build, lint, test y TypeScript con el repo completo: NO EJECUTADO desde la integración GitHub.
2. Probar accesos Auth reales y MFA del sistema nuevo: NO EJECUTADO.
3. Confirmar rutas heredadas/nested loaders y su acceso por separado: inspección parcial; no certificable.
4. Probar operaciones concurrentes en conexiones distintas: NO EJECUTADO.
5. Probar formularios en navegador/móvil: NO EJECUTADO.
6. Revisar toda la superficie RLS y funciones de escritura, incluidas las acciones administrativas: NO COMPLETADO.
7. Revisar ciclo de caché de usuario y cambios rápidos de sesión: corrección parcial, falta prueba E2E.
8. Supabase generado types vs consultas nuevas: falta compilación, no se certifica.
9. Preparar repositorio y despliegue realmente independientes: PENDIENTE.

## Decisión de seguridad
No habilitar RPC de stock ni recepción para authenticated; no activar formularios de escritura; mantener datos de producción fuera del nuevo proyecto.
