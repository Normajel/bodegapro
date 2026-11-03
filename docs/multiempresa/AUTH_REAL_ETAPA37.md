# Etapa 37 — Acceso real al entorno Multiempresa

## Implementado
- La ruta `/auth` de la rama `multiempresa-desarrollo` deja de utilizar el inicio de sesión heredado de BodegaPro y adopta `supabase.auth.signInWithPassword` del proyecto independiente `vatpxpzdxstysvchyqqk`.
- Después del login, `loadMyCompanies()` comprueba la cuenta confirmada mediante Supabase Auth y consulta las membresías y empresas activas protegidas por RLS.
- Si no tiene empresas asignadas, cierra sesión y muestra un mensaje seguro; si tiene acceso, dirige a `/compras`, una ruta habilitada en el entorno de consulta.
- `CompanySelector` ofrece cerrar sesión explícitamente y limpiar el caché de consultas.
- La app ya verifica que el host de Supabase corresponda al proyecto separado; evita conectar por error con Contemar.
- No se creó ningún usuario ni contraseña de prueba; se mantiene bloqueada la escritura de recepciones.

## Limitaciones comprobadas
La consulta administrativa al proyecto nuevo devolvió `auth.users=0`, `companies=0`, `company_memberships=0`; por tanto, aún no es posible comprobar un inicio de sesión de usuario real end-to-end. La conexión de correo/contraseña se ajusta a la API oficial Supabase Auth.

## Plan de pruebas para cuentas temporales autorizadas
1. Crear dos empresas de prueba diferentes y cuentas Auth con correos de prueba que controle el administrador; confirmar correo si corresponde.
2. Asignar rol BODEGA a usuario A solo en empresa A, y rol BODEGA a usuario B solo en empresa B.
3. Entrar a la URL de preview multiempresa desde dos navegadores independientes.
4. Confirmar que cada usuario solo ve sus empresas; cambiar empresa cuando hay más de una membresía.
5. Intentar ver OCs, proveedores, productos y movimientos de la otra empresa; confirmar RLS sin datos ajenos.
6. Revocar membresía en Supabase y confirmar que, al volver a consultar, se impide acceso.
7. Cerrar sesión, volver a cargar y confirmar que no aparece el caché de la empresa anterior.
8. Probar sesiones expiradas, permisos sin aprobación y MFA antes de habilitar registros.

## Restricciones
- No conectar ni reutilizar las credenciales Contemar.
- No habilitar el botón «Registrar recepción», ni dar permisos EXECUTE a la RPC de recepción.
- El frontend todavía es una vista de consulta y faltan MFA/flujo de alta administrado.
- GitHub Actions y compilación deben verificarse para el último commit después del formateo.
