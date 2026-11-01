# Preparación de entorno aislado de pruebas — BodegaPro

## Estado

- Supabase principal: mqgxgrozgntmkwjfubuh (NO modificar).
- Consulta de ramas: ninguna rama de desarrollo existente al 2026-10-31.
- Rama GitHub: audit/recepciones-seguridad-20261031.
- Base aislada: PENDIENTE DE CREACIÓN (requiere organización y confirmar cualquier coste).

## Secuencia de preparación

1. Elegir organización Supabase y consultar coste de branch antes de crearlo.
2. Crear rama de desarrollo Supabase, sin copiar datos de producción automáticamente.
3. Verificar tablas, RLS, funciones y triggers; comprobar que la rama reproduzca las migraciones actuales. Si hay drift de esquema, detener y documentar.
4. Aplicar solo en rama aislada la migración candidata tras revisión de permisos, y ejecutar asesores de seguridad.
5. Crear exclusivamente datos ficticios: proveedores, productos con stock inicial y OC de dos líneas; usuarios de prueba con perfiles BODEGA, GERENCIA, ADMIN y ADMINPRO, autenticación real y MFA cuando corresponda.
6. Ejecutar matriz docs/pruebas-recepcion-roles.md. Registrar para cada caso estado previo, resultado y estado posterior de OC, ítems, stock y movimientos.
7. Comprobar idempotencia, rollback ante errores y recepción concurrente.
8. No publicar frontend ni fusionar cambios hasta que todos los casos obligatorios pasen.

## Advertencias

- Branch Supabase no equivale a branch GitHub: se administran por separado.
- No copiar credenciales ni datos reales a la rama.
- No usar la base principal como staging.
- La migración candidata no está validada para producción; requiere corregir cualquier fallo observado.
