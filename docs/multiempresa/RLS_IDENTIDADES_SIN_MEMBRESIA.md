# Prueba de identidades simuladas sin membresía — etapa 17

Proyecto: INTEGRASTOCK Multiempresa. La base Contemar no se utilizó.

Prueba ejecutada en una transacción reversible:
- Dos empresas temporales (A y B).
- Dos UUID de identidad simulada, ninguno registrado como miembro de las empresas.
- Lectura bajo el rol PostgreSQL `authenticated` y `request.jwt.claim.sub` simulado individualmente.
- Las políticas RLS impidieron consultar ambas empresas sin membresía.
- `ROLLBACK` ejecutado. Verificación posterior: 0 empresas, 0 productos, 0 membresías.

**Límite:** esto prueba el rechazo de identidades sin membresías, no el aislamiento entre cuentas de prueba con membresías efectivas. La FK de `company_memberships.user_id` refiere `auth.users`; no se crearon usuarios reales ni se modificó Auth. Falta comprobar ambos accesos permitidos y cruzados, bajo sesiones autenticadas válidas y con datos de prueba.

Security advisor: 4 avisos informativos (billing, no se exponen políticas por diseño). No es prueba de seguridad integral.

## Próxima prueba obligatoria
Crear dos usuarios de prueba del Supabase nuevo mediante aprovisionamiento seguro, asignar empresa A y empresa B con un rol limitado; probar SELECT/INSERT/UPDATE/DELETE de ambos tenants y cambios de contexto. No habilitar cambios de stock ni flujos de OC antes de cerrar estas pruebas.
