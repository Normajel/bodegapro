-- PROPUESTA NO APLICADA. Ejecutar SOLO junto con migracion_recepcion_oc_bodega_v1.sql
-- en una misma transacción y tras respaldo + pruebas de perfiles.
-- Impide UPDATE directo de received_quantity desde anon/authenticated.
-- La RPC receive_purchase_order debe ser SECURITY DEFINER, con comprobación
-- explícita de permisos y propietario de confianza (no authenticated/anon).
--
-- ACL actual comprobada: anon y authenticated tienen UPDATE de tabla.
-- Revocar UPDATE de tabla es necesario: un GRANT por columna NO restringe
-- un GRANT UPDATE previamente concedido a nivel de tabla.
--
-- PRECONDICIÓN: verificar grants heredados/PUBLIC y cualquier otro rol cliente.
-- PRECONDICIÓN: verificar las operaciones INSERT/DELETE de líneas de OC,
-- pues estos permisos siguen siendo otra vía de manipulación.
BEGIN;
REVOKE UPDATE ON TABLE public.purchase_order_items FROM anon, authenticated;
REVOKE UPDATE ON TABLE public.purchase_order_items FROM PUBLIC;
-- Mantener edición de datos ordinarios para usuarios autorizados por RLS.
-- Excluir received_quantity (y no conceder UPDATE general de tabla).
GRANT UPDATE (
  purchase_order_id, product_id, quantity, measure_unit,
  unit_cost, item_type, description, line_total
) ON TABLE public.purchase_order_items TO authenticated;
-- NO GRANT UPDATE(received_quantity) a authenticated ni anon.
-- La función SECURITY DEFINER de recepción, con propietario privilegiado,
-- podrá actualizar received_quantity tras verificar rol, OC, cantidades
-- y bloqueo transaccional; RLS continúa gobernando el resto de operaciones.
COMMIT;

-- PRUEBAS OBLIGATORIAS:
-- A) authenticated: UPDATE received_quantity debe fallar por permisos.
-- B) authenticated con purchases.edit: UPDATE quantity/description debe seguir
--    funcionando según RLS y reglas de negocio.
-- C) BODEGA: RPC recibe parcial/completa y modifica stock + received_quantity.
-- D) GERENCIA: RPC denegada.
-- E) verificar funciones existentes que escriban received_quantity.
-- F) verificar INSERT con received_quantity prellenado, DELETE de líneas
--    recepcionadas y cambios de quantity bajo el recibido.
-- G) revisar PUBLIC y grants heredados, y que ningún rol cliente sea dueño
--    de la función SECURITY DEFINER.
