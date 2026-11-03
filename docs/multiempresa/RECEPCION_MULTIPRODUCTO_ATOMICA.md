# Etapa 34 — Recepción multiproducto transaccional

Proyecto: INTEGRASTOCK Multiempresa (Supabase `vatpxpzdxstysvchyqqk`). La base Contemar y rama `main` no se modificaron.

## Cambios implementados en Supabase
- Tabla `public.tenant_po_receipt_batches`: identificador del lote, empresa, OC, usuario, guía/factura, número, observaciones y líneas canónicas. RLS habilitada, sin permisos directos para `anon` ni `authenticated`.
- Índice único `(company_id,batch_id,purchase_order_item_id)` en movimientos vinculados a lotes.
- Función `public.receive_tenant_purchase_order_batch(company_id,order_id,operation_key,items,document_type,document_number,notes)` de tipo SECURITY DEFINER y `search_path=''`.
- Permisos EXECUTE revocados a `public`, `anon` y `authenticated`. No se habilitó escritura frontend.
- Verificaciones de rol BODEGA/ADMIN/ADMINPRO, empresa activa, OC aprobada, cantidades enteras positivas, líneas únicas y del mismo tenant, productos activos, documentos, pendientes y reintentos idénticos.
- La operación actualiza stock, líneas de OC, movimientos de entrada con folio/documento y estado `parcial`/`completa` dentro de la misma transacción.

## Prueba SQL reversible
Con un usuario temporal BODEGA, dos productos (OC: 10 y 6 unidades):
1. Primera recepción de 4 y 2: dos movimientos y OC parcial — OK.
2. Reintento con igual clave y líneas en diferente orden: no duplicó — OK.
3. Reintento de misma clave con cantidades diferentes: rechazado — OK.
4. Lote con una línea válida y otra de exceso: transacción revertida, sin cambios parciales — OK.
5. Recepción final de 6 y 4: stock 10 y 6, OC completa — OK.

Se ejecutó ROLLBACK y se confirmó 0 empresas, productos, OC, movimientos, lotes y usuarios Auth. El EXECUTE de la función para authenticated sigue en falso. El analizador informó 6 lints INFO de tablas deliberadamente cerradas (4 billing, contador de folios y lotes de recepción).

## Faltantes antes de activar
- Pruebas con sesiones Auth reales y dos empresas, incluyendo permisos y revocación de membresías.
- Pruebas concurrentes entre conexiones distintas y comprobación de reintentos HTTP.
- Verificación de almacenamiento de documentos y UX de recepción.
- Decidir cómo el mismo guardado se expone desde Órdenes de compra y desde Movimientos, sin operación paralela.
- Confirmar GitHub Actions/TypeScript/compilación cuando la interfaz se conecte.
