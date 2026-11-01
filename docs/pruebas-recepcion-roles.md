# Pruebas controladas de recepción y perfiles

**Estado:** plan preparado; las pruebas funcionales de escritura NO se ejecutaron. La migración candidata aún no está instalada.

## Preparación

Usar proyecto aislado de staging o una copia restaurable de la base demo. Crear una OC con dos productos y cantidades enteras, aprobada por GERENCIA; registrar stock inicial. Utilizar sesiones reales de BODEGA, GERENCIA, ADMIN y ADMINPRO. No simular permisos con el rol postgres: el comportamiento de auth.uid() y RLS sería diferente.

## Casos de prueba

| Caso | Perfil | Acción | Esperado |
|---|---|---|---|
| P01 | BODEGA | Recepción parcial (ej. 2 de 5) con guía | Movimiento entrada +2; received_quantity=2; OC parcial; stock +2 |
| P02 | BODEGA | Recepción saldo (3 de 5) | Movimiento +3; received_quantity=5; OC completa; stock total +5 |
| P03 | BODEGA | Repetir recepción completa | Rechazo sin nuevos movimientos |
| P04 | BODEGA | Cantidad decimal o negativa | Rechazo sin efectos |
| P05 | BODEGA | Cantidad mayor a pendiente | Rechazo sin efectos |
| P06 | BODEGA | Línea duplicada o UUID inválido | Rechazo sin efectos |
| P07 | BODEGA | OC no aprobada | Rechazo sin efectos |
| P08 | BODEGA | UPDATE directo de received_quantity | Rechazo |
| P09 | BODEGA | DELETE/UPDATE movimiento de recepción OC | Rechazo |
| P10 | GERENCIA | Ejecutar RPC recepción | Rechazo |
| P11 | GERENCIA | Aprobar OC | Permitido |
| P12 | GERENCIA | Anular OC sin autorización | Rechazo |
| P13 | ADMIN | Recepción parcial/completa | Permitido |
| P14 | ADMINPRO | Recepción parcial/completa | Permitido con MFA vigente |
| P15 | BODEGA | Entrada excepcional sin OC | Permitido según permisos existentes |
| P16 | ADMIN | Anular OC pendiente sin recepción | Permitido |
| P17 | ADMIN | Anular OC con recepción parcial | Rechazo |
| P18 | BODEGA | Dos recepciones concurrentes que excedan saldo | Una rechazada; sin sobre-recepción |

## Verificación posterior a cada caso

Consultar purchase_orders.status, purchase_order_items.received_quantity, stock_movements.purchase_order_item_id/document_number/quantity y products.stock. Confirmar que el delta de stock coincide exactamente con la suma de entradas. Comprobar ausencia de cambios cuando hay rechazo.

## Resultado de ejecución (solo lectura)

- Se consultaron app_roles.permissions en Supabase.
- ADMIN y ADMINPRO: purchases.view/edit y movements.create = true.
- BODEGA: purchases.view=true, purchases.edit=false, movements.create=true.
- GERENCIA: purchases.view=true, purchases.edit no concedido, movements.create no concedido.
- No se probó la RPC candidata con JWT ni se hicieron escrituras.
- La migración SQL candidata necesita revisión de privilegios, triggers y bypass de UPDATE directo antes de aplicar.

**Criterio de salida:** no desplegar mientras P01-P18 no estén comprobados en entorno aislado y documentados.
