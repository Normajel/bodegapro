-- PROPUESTA PARA REVISIÓN. NO APLICAR AÚN.
-- Bloquea cambios directos sobre recepciones de OC, sin alterar movimientos independientes.
-- Los cambios legítimos en cantidades recibidas deben realizarse únicamente
-- mediante la RPC receive_purchase_order, con una marca transaccional protegida.
-- IMPORTANTE: una variable de sesión GUC establecida por el cliente NO es una
-- autorización segura. Por ello este borrador NO usa current_setting como bypass.
--
-- Estrategia recomendada: revocar UPDATE de received_quantity a roles cliente
-- mediante privilegios por columna, y canalizar cambios vía función SECURITY DEFINER.
-- Se requiere revisar grants actuales antes de diseñar el REVOKE exacto.
--
-- 1. Protección de movimientos vinculados a OC: bloquear UPDATE/DELETE directos.
CREATE OR REPLACE FUNCTION public.guard_oc_stock_movement_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.purchase_order_id IS NOT NULL OR OLD.purchase_order_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'Los movimientos vinculados a OC no se pueden editar ni eliminar directamente';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS guard_oc_stock_movement_mutation ON public.stock_movements;
CREATE TRIGGER guard_oc_stock_movement_mutation
BEFORE UPDATE OR DELETE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.guard_oc_stock_movement_mutation();

-- 2. Protección de líneas de OC: evitar manipular cantidades recibidas directamente.
-- REQUIERE DISEÑO FINAL: la RPC de recepción debe poder actualizar received_quantity,
-- y el trigger no debe permitir suplantación por un cliente autenticado.
-- No se incluye un bypass basado en una GUC que cualquier usuario podría establecer.
-- Se evaluará control de privilegios y función dedicada con propietario aislado.
