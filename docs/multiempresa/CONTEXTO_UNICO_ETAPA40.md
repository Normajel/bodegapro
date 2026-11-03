# Etapa 40 — Contexto único de empresa y limpieza de sesión

Proyecto: INTEGRASTOCK Multiempresa, rama `multiempresa-desarrollo`. Sin cambios en `main` ni Contemar.

## Problema resuelto
Anteriormente, cada página de Inventario, Proveedores, Órdenes de compra y Movimientos lanzaba independientemente `loadMyCompanies()` y escuchaba un evento DOM. Una lectura tardía de una página podía volver a seleccionar una empresa anterior después de un cambio de usuario, o quedar desincronizada si el evento ocurrió antes del montaje.

## Implementación
- Nuevo `src/lib/multiempresa/company-context.ts` con un único identificador de empresa activo en memoria y `useSyncExternalStore`.
- `CompanySelector.tsx` publica la selección en el contexto único; al cambiar la sesión, limpia primero el caché y publica el valor vacío; conserva su validación de pertenencia obtenida con `loadMyCompanies`.
- Las cuatro vistas de consulta ya no cargan su empresa por separado ni conservan selecciones locales.
- Las consultas TanStack usan claves que incluyen `companyId`, y sus peticiones permanecen deshabilitadas cuando no hay empresa seleccionada.
- Nueva prueba `company-context.test.ts`: selección, cambio, borrado, eventos y desuscripción.

## Seguridad
Este estado del cliente solo controla la presentación. **No autoriza consultas ni escrituras**. `tenant-catalog.ts` exige pertenencia activa y RLS del PostgreSQL del nuevo Supabase sigue siendo la autoridad. Las operaciones de registro siguen bloqueadas desde el frontend.

## Pendiente de validación
- Confirmar resultado del último GitHub Actions (TypeScript, ESLint, Prettier, pruebas unitarias y build).
- Confirmar compilación final de Vercel para el commit de esta etapa.
- Verificar intercambio real de usuarios y revocación de membresías con cuentas Supabase Auth. Por ahora no hay cuentas Auth asignadas a DEMO.
- Completar recepción de OC desde un único flujo cuando se autoricen pruebas reales.
