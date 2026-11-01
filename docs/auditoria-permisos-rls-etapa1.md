# Etapa 1 — Verificación de permisos SQL y RLS (2026-10-31)

Consultas de solo lectura realizadas contra Supabase.

## Funciones

| Función | EXECUTE authenticated | EXECUTE anon | SECURITY DEFINER |
|---|---|---|---|
| approve_purchase_order | Sí | No | Sí |
| receive_purchase_order | Sí | No | No |
| cancel_purchase_order | Sí | No | No |

Tener EXECUTE no equivale a poder completar la operación: se aplican comprobaciones internas y RLS.

## Políticas relevantes

- `purchase_orders`: UPDATE requiere `has_app_permission('purchases','edit')`; SELECT permite `purchases.view` o `reports.view`.
- `purchase_order_items`: UPDATE requiere `purchases.edit`; SELECT permite `purchases.view` o `reports.view`.
- `stock_movements`: INSERT permite `movements.create` o `purchases.edit`.
- Perfil BODEGA: `purchases.view=true`, `purchases.edit=false`, `movements.create=true`.
- Perfil GERENCIA: `purchases.view=true`; sin permiso `purchases.edit`.

## Hallazgos

1. `cancel_purchase_order` es SECURITY INVOKER y no tiene comprobación interna explícita de perfil. El UPDATE está sujeto a RLS: BODEGA y GERENCIA no deberían poder completarlo por la política vigente. Falta prueba con JWT real para confirmar denegación y verificar resultado de UPDATE.
2. `receive_purchase_order` también es SECURITY INVOKER y actualiza `purchase_order_items` y `purchase_orders`. BODEGA carece de `purchases.edit`; por tanto su recepción mediante esta RPC probablemente falla por RLS. **No** otorgar edición general de compras para solucionarlo.
3. La solución requiere una operación de recepción de alcance restringido con comprobación explícita de permiso específico, y pruebas de stock, cantidades y estado de OC. Evaluar función protegida en esquema privado, permisos EXECUTE y RLS antes de implementar.
4. `approve_purchase_order` es SECURITY DEFINER; la autorización interna ya fue inspeccionada anteriormente, pero falta prueba con roles reales.

## Pendiente de pruebas

- BODEGA: recepción de OC aprobada y denegación de anulación.
- GERENCIA: aprobación permitida y anulación denegada.
- ADMIN: anulación de OC pendiente sin recepciones.
- Todos: impedir anulación de OC con recepciones y modificación directa de movimientos ligados a OC.

No se alteró Supabase ni la rama main.
