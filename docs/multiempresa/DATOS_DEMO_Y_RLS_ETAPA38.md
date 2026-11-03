# Etapa 38 — Datos DEMO de dos empresas y prueba real de RLS

Fecha: 2026-11-02 (Chile). Proyecto Supabase independiente: `vatpxpzdxstysvchyqqk`. No se modificó Contemar ni `main`.

## Datos de demostración persistentes

| Empresa | UUID | SKU | OC | Estado |
| --- | --- | --- | --- | --- |
| DEMO · Empresa Norte | `e3800000-0000-4000-8000-000000000001` | DEMO-001 | DEMO-OC-001 | pendiente de aprobación |
| DEMO · Empresa Sur | `e3800000-0000-4000-8000-000000000002` | DEMO-001 | DEMO-OC-001 | pendiente de aprobación |

Cada empresa tiene un proveedor, un producto con stock 0 y una OC con una línea (Norte 5 unidades, Sur 8). Los totales y nombres son ficticios. Ninguna OC está aprobada ni genera movimientos. Repetir SKU/folio entre empresas es deliberado: la unicidad está limitada a `company_id`.

## Prueba de acceso con RLS real de PostgreSQL

Se crearon dos identidades **temporales de base de datos** con membresía BODEGA, se utilizó `SET LOCAL ROLE authenticated` con `request.jwt.claim.sub` correspondiente, y se verificó que para cada una fueran visibles exactamente 1 empresa, 1 proveedor, 1 producto, 1 OC y 1 línea de OC. Buscar el producto de la otra empresa retornó 0 filas. La transacción de prueba terminó con `ROLLBACK`, sin persistir usuarios ni membresías.

Esta prueba sí ejercitó las políticas RLS como `authenticated`, pero no equivale a un inicio de sesión real mediante GoTrue/Supabase Auth o un token JWT emitido por la API.

## Estado posterior verificado

- 2 empresas, 2 proveedores, 2 productos, 2 órdenes, 2 líneas.
- 0 usuarios Auth, 0 membresías persistentes, 0 movimientos.
- La función `receive_tenant_purchase_order_batch` mantiene `EXECUTE=false` para `authenticated`.

## Próxima fase

Crear cuentas Auth de ensayo utilizando correos controlados, sin credenciales heredadas de Contemar. Asignar membresías solo después de la creación real de usuarios. Verificar inicio/cierre de sesión, lectura restringida, revocación y expiración de sesión desde el navegador. No activar escritura antes de esas comprobaciones.

## Eliminación posterior

Los datos son explícitamente DEMO y pueden eliminarse de forma controlada al terminar las pruebas; primero borrar líneas de OC, órdenes, productos, proveedores y finalmente las dos empresas por los UUID declarados arriba. No ejecutar borrados generales del proyecto.
