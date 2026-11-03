# Etapa 35 — Pruebas de roles y aislamiento de recepciones multiproducto

Proyecto probado: INTEGRASTOCK Multiempresa (`vatpxpzdxstysvchyqqk`). No se modificó Contemar ni `main`.

Prueba SQL reversible: dos empresas (A y B), tres identidades Auth temporales, membresías BODEGA A, BODEGA B y VENTAS A; dos órdenes aprobadas, un producto por empresa.

## Resultados verificados
- BODEGA A recibe dos unidades de A — OK.
- BODEGA A no puede recibir producto de B — OK.
- La operación cruzada no modifica el stock de B — OK.
- VENTAS A no puede recibir — OK.
- BODEGA A pierde su membresía activa y deja de poder recibir — OK.
- BODEGA B recibe tres unidades de B. Los stocks finales transitorios permanecen separados (A=2, B=3) — OK.

La transacción concluyó con ROLLBACK; conteos verificados después: 0 empresas, membresías, productos, OC, movimientos, lotes y usuarios. `authenticated` mantiene `EXECUTE=false` para `receive_tenant_purchase_order_batch`.

El asesor de seguridad mantiene seis avisos INFO sobre tablas cerradas intencionalmente (4 billing, contador de folios, lotes de recepción).

**Límites**: sesiones simuladas con variables JWT SQL; no se probaron sesiones Auth reales ni dos conexiones concurrentes. Falta integración de documentación desde frontend y aprobación de órdenes. Mantener el botón de registro deshabilitado.
