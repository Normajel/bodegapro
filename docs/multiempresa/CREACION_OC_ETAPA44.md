# Etapa 44 — Borrador de creación de órdenes de compra multiempresa

Proyecto Supabase independiente `vatpxpzdxstysvchyqqk`, rama `multiempresa-desarrollo`; sin cambios en Contemar ni en `main`.

## Preparado en React
- Formulario de borrador en el módulo Órdenes de compra con selector **Productos** o **Servicios**.
- Proveedor filtrado según su tipo y empresa activa.
- Para productos, selector del inventario de esa empresa; para servicios, descripción independiente.
- Múltiples líneas, cantidades enteras positivas, costos unitarios en CLP, condiciones de pago, número de OC y observaciones.
- Cálculo de neto, IVA al 19% y total; revisión previa sin persistencia.
- Cambio de tipo borra proveedor y líneas para evitar mezclas. El formulario se reinicia al cambiar de empresa.
- Pruebas unitarias en `new-order.test.ts` para totales, servicios, proveedor incorrecto, cantidades y duplicados.

## Supabase
- Función `create_tenant_purchase_order(company_id,order_id,order_kind,supplier_id,order_number,payment_terms,notes,items)`, que crea la OC y todas sus líneas dentro de una transacción.
- Exige usuario autenticado y membresía activa **ADMIN o ADMINPRO** de una empresa activa.
- Valida proveedor, catálogo de productos, descripción, unidad, cantidades y costos; evita número duplicado dentro de la empresa y tipos mezclados.
- El total de cada línea `line_total` lo calcula PostgreSQL: la función fue corregida tras detectarse que es una columna generada.
- La creación no altera stock ni genera movimientos y deja la OC pendiente de aprobación.
- **La función mantiene EXECUTE revocado** de roles `public`, `anon` y `authenticated`.
- `new-order-service.ts` es el único servicio preparado para enlazar el guardado con la RPC; `PURCHASE_CREATION_WRITES_ENABLED=false`, sin llamadas de escritura desde el formulario.

## Prueba SQL reversible
Cinco casos exitosos: creación atómica con neto $5.000 y total $5.950; stock sin cambios; proveedor incompatible rechazado; cantidad inválida revierte toda la OC; Bodega no puede crear. Se usó ROLLBACK sin dejar usuarios ni pedidos temporales.

## Pendientes para activación
1. Crear cuentas de prueba reales y comprobar permisos, sesiones, MFA y RLS desde el navegador.
2. Validar configuración del número de OC, numeración automática, impuestos y autorizaciones reales.
3. Enlazar botón Crear OC con `submitTenantNewOrder`, gestionar reintentos/confirmación y actualizar listado.
4. Agregar selección de productos especiales y ajustes de condiciones comerciales.
5. Verificar GitHub Actions y despliegue finales de la etapa.

No se publican operaciones de escritura para usuarios de la web.
