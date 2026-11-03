# Etapa 39 — Preparación de cuentas Auth y aislamiento de sesión

## Cambios en `multiempresa-desarrollo`
1. El selector de empresa borra el caché y los datos de selección **antes** de validar una cuenta que entra o cambia.
2. Las solicitudes de membresía se identifican con un contador de generación. Una respuesta asíncrona anterior no puede reinstalar empresas de otra sesión.
3. Se verifica de nuevo `supabase.auth.getUser()` al terminar la carga de membresías y se rechaza el resultado si cambió el usuario.
4. El error de autenticación/lectura limpia el contexto y no deja filas antiguas visibles.
5. Se conserva la redirección por login a `/compras`, sin habilitar acciones de escritura.

## Asignación administrativa
Se agregó `docs/multiempresa/asignar_cuentas_demo_etapa39.sql`: solo funciona con **dos cuentas reales ya creadas y confirmadas** en Supabase Auth, con correos distintos. El script valida los UUID exactos y nombres DEMO antes de asignar rol BODEGA, y rechaza una asignación inesperada. **No ejecutar hasta que existan dichas cuentas**.

No se inventaron correos válidos ni contraseñas, no se guardaron tokens de acceso y no se reutilizaron credenciales del sistema Contemar.

## Pruebas pendientes
- Inicio de sesión real con cuenta Auth Norte y Sur desde navegadores separados.
- Cambio y revocación de membresías con consultas de datos RLS.
- Inicio/cierre de sesión bajo latencia de red, expiración y cambio rápido de usuario.
- Validaciones completas GitHub Actions posteriores a los cambios de auth.
- Habilitación de la recepción multiproducto: sigue desactivada.

## Entornos
Proyecto nuevo Supabase: `vatpxpzdxstysvchyqqk`. Rama: `multiempresa-desarrollo`. No modificar `main` ni Contemar.
