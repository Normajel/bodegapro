# Pruebas de aislamiento RLS — continuación

Proyecto: INTEGRASTOCK Multiempresa, NO Contemar. Fecha: 2026-11-02.

## Comprobación ejecutada
Se ejecutó un bloque SQL usando `SET LOCAL ROLE authenticated` y `row_security = on`, sin identidad JWT de usuario.
- La consulta a `public.products` devolvió cero filas.
- Se intentó insertar una orden de compra: la operación fue rechazada por controles de permisos/integridad.
- No se crearon usuarios reales ni se cargaron datos duraderos.

## Límite de interpretación
La comprobación del rol sin identidad JWT no equivale a probar usuarios de empresa A/B. Las restricciones por empresa deben verificarse con dos cuentas reales del nuevo proyecto Supabase, y los casos de lectura, INSERT, UPDATE, DELETE, acceso desde RPC y posibles loaders SSR.

## Matriz para pruebas con cuentas separadas
- Usuario A lee productos/proveedores/órdenes de A: permitido.
- Usuario A lee productos/proveedores/órdenes de B: cero filas o denegado.
- Usuario B lee datos de A: cero filas o denegado.
- Usuario A intenta crear o modificar con `company_id=B`: denegado.
- Usuario B intenta una OC de A: denegado.
- Usuario con membresía suspendida: denegado.
- Usuario miembro de A y B cambia empresa activa: solo ver datos de la elegida.
- Cierre de sesión y cambio de cuenta: caché y selector se limpian.

Mantener todas las rutas heredadas bloqueadas hasta validar que los loaders del servidor no ejecutan consultas de la aplicación original.
