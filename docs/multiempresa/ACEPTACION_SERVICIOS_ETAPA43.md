# Etapa 43 — Aceptación de OC de servicios multiempresa

Rama `multiempresa-desarrollo`; Supabase exclusivo `vatpxpzdxstysvchyqqk`. No se modificaron `main` ni Contemar.

## Base de datos

- Función transaccional `public.accept_tenant_service_order(company_id, order_id)` con `SECURITY DEFINER`, `search_path=''`, validación de rol ADMIN/ADMINPRO/GERENCIA/GERENTE y membresía en empresa activa.
- Solo acepta **órdenes con líneas exclusivamente de servicio**, proveedor de tipo `servicios` o `ambos`, pendientes y sin aprobación previa.
- Registra una fila en `accepted_services` por línea con proveedor, OC, fechas de creación/aprobación, forma de pago, cantidad, unidad, valores netos y total con IVA, estado `ACEPTADO`.
- Actualiza la OC: `approval_status=aprobada`, `status=ACEPTADO`, `approved_by`, `approved_at`.
- **No modifica productos ni crea movimientos físicos de stock**. Se rechazan órdenes mixtas o productos físicos en esta función.
- La función mantiene EXECUTE revocado de `public`, `anon` y `authenticated` hasta las pruebas con cuentas Auth reales.

## Interfaz

- `TenantServicesLedger`: historial por proveedor dentro de Órdenes de compra y en Movimientos como sección separada, nunca una entrada de inventario.
- El catálogo consulta las líneas para clasificar órdenes como `producto`, `servicio` o `mixta`.
- Las órdenes aceptadas de servicios no muestran formulario de recepción física.
- Para servicios, la acción de Gerencia es `Aceptar servicios`, aún deshabilitada por seguridad.
- Las órdenes mixtas muestran aviso específico y tampoco habilitan recepción.

## Pruebas SQL

Se probaron seis casos usando datos temporales y `ROLLBACK`: Bodega denegada; rechazo entre empresas; dos líneas aceptadas con datos; estado OC actualizado; ningún movimiento físico; repetición sin duplicaciones. Después se repitió una prueba con `status=ACEPTADO`, `approval_status=aprobada`, neto 20.000, total 23.800 y 0 movimientos físicos. Resultado PASS.

## Pendiente

- Cuentas reales Supabase Auth, pruebas de permisos end-to-end y habilitación controlada de RPC.
- Definir y probar tratamiento de OCs mixtas producto/servicio.
- Validación de totales tributarios y eventual distribución de redondeos por línea para casos financieros reales.
- Confirmar cinco GitHub Actions del commit final y despliegue Vercel.
