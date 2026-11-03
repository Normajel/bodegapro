# Etapa 42 — Aprobación de órdenes de compra por empresa

## Cambios confirmados
- Se creó en **Supabase Multiempresa** (`vatpxpzdxstysvchyqqk`) `approve_tenant_purchase_order(p_company_id uuid,p_order_id uuid)`.
- Función transaccional con `SECURITY DEFINER` y `search_path=''`, bloqueo de fila de OC, autenticación obligatoria y validación de membresía activa y empresa activa.
- Solo los roles `ADMIN`, `ADMINPRO`, `GERENCIA` y `GERENTE` pueden aprobar a nivel SQL.
- Se exige OC en estado `pendiente` y aprobación `por_aprobar`, al menos una línea y ausencia de metadatos de aprobación previos.
- Actualiza `approval_status=aprobada`, `approved_by`, `approved_at` y `updated_at`. Repetir la aprobación provoca rechazo sin sobrescribir autor ni fecha.
- Se bloqueó la función heredada `approve_purchase_order(uuid)` para `authenticated`, `anon` y `public`.
- Se deniega la aprobación por esta función de OC que contengan servicios: requieren completar el flujo `accepted_services` antes de su habilitación.
- El servicio React `approval-service.ts` comprueba también el rol y está bloqueado con `PURCHASE_APPROVAL_WRITES_ENABLED=false`. Se añadieron pruebas de permiso por rol.
- El historial de OC consulta `approved_at` y `approved_by`; muestra fecha y acción de Gerencia/Administración deshabilitada hasta completar Auth real.

## Pruebas SQL realizadas
Se usaron usuarios Auth simulados en una transacción reversible sobre la empresa DEMO Norte:
1. BODEGA intenta aprobar — denegado.
2. GERENCIA Norte intenta aprobar OC de Sur — denegado.
3. GERENCIA Norte aprueba OC de Norte — correcto, fecha y usuario registrados.
4. Segundo intento de la misma OC — rechazado.
5. La OC de Sur quedó sin cambios.

Se verificó que `authenticated` no tiene EXECUTE sobre la nueva función. La transacción terminó en ROLLBACK, preservando las OCs DEMO.

## Pendientes
- Pruebas de login auténtico con cuentas Auth Norte/Sur y revocación de membresía.
- Completar aprobación de OCs con servicios y tabla de servicios aceptados; debe conservar estado ACEPTADO sin afectar inventario.
- Habilitar aprobación solo después de pruebas end-to-end y revisión del flujo Bodega.
- Confirmar las cinco validaciones del último GitHub Actions y el despliegue de este commit.
- No activar recepciones de stock hasta terminar pruebas Auth.

**La rama `main` y el proyecto original Contemar no se modificaron.**
