# Integración OC y Movimientos — etapa de consulta y trazabilidad

## Implementado en la rama multiempresa-desarrollo

- Las órdenes de compra muestran sus productos, cantidades solicitadas, cantidades recibidas y cantidades pendientes.
- Desde una OC aprobada se puede consultar el historial de movimientos de **entrada** vinculados a la misma empresa y a esa OC.
- En el historial de Movimientos se identifica la OC de origen, usando el número de orden cuando está disponible.
- La vista de recepciones usa `company_id` y `purchase_order_id` para limitar los datos; el filtrado de consulta no reemplaza RLS.
- Se añadieron pruebas unitarias sobre cantidades de recepción: enteros positivos, balance pendiente, rechazo de cero, negativos, decimales y valores fuera de rango.

## Estado de la escritura

Las operaciones de recepción permanecen **bloqueadas** para clientes. La función transaccional `receive_tenant_purchase_order_item` está creada en el Supabase multiempresa, pero sus permisos EXECUTE siguen revocados para `authenticated`. Por tanto, el botón **Recibir** permanece deshabilitado.

## Pendientes antes de activar

1. Completar autenticación, sesiones reales y perfiles de dos empresas; validar aislamiento y roles.
2. Pruebas concurrentes de recepciones, reintentos y claves idempotentes en sesiones independientes.
3. Completar la aprobación de OC por Gerencia y el registro de documentos de recepción.
4. Enlazar el mismo flujo de recepción desde Órdenes de compra y desde Movimientos, sin un segundo mecanismo de modificación de stock.
5. Validar casos de OC con productos especiales y servicios (no deben alterar el stock de productos normales).
6. Probar navegador y móvil, y publicar el repositorio/despliegue independiente.

**No se modificaron `main` ni la base Contemar.**
