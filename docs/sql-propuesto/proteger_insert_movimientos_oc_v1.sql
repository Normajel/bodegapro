-- PROPUESTA DE SEGURIDAD / NO APLICADA.
-- Integrar en la MISMA transacción que la migración de receive_purchase_order
-- a SECURITY DEFINER (propietario postgres), nunca de manera independiente.
-- La función no acepta marcas manipulables del cliente (GUC, notas, JWT custom).
--
-- Protección de INSERT directo de movimientos ligados a OC.
-- current_user identifica el rol SQL efectivo. En la RPC SECURITY DEFINER
-- propiedad de postgres es postgres; en INSERT directo por PostgREST es
-- authenticated. Es indispensable auditar otras funciones SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.guard_oc_stock_movement_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $guard$
BEGIN
  IF NEW.purchase_order_id IS NOT NULL
     OR NEW.purchase_order_item_id IS NOT NULL
     OR NULLIF(BTRIM(NEW.purchase_order), '') IS NOT NULL
  THEN
    IF current_user <> 'postgres' THEN
      RAISE EXCEPTION
        'Las entradas vinculadas a órdenes de compra deben registrarse desde la recepción autorizada';
    END IF;
    IF NEW.purchase_order_id IS NULL OR NEW.purchase_order_item_id IS NULL THEN
      RAISE EXCEPTION 'La recepción requiere identificadores de OC y línea';
    END IF;
    IF NEW.type IS DISTINCT FROM 'entrada' THEN
      RAISE EXCEPTION 'La recepción de OC debe ser una entrada';
    END IF;
  END IF;
  RETURN NEW;
END;
$guard$;

DROP TRIGGER IF EXISTS guard_oc_stock_movement_insert ON public.stock_movements;
CREATE TRIGGER guard_oc_stock_movement_insert
BEFORE INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.guard_oc_stock_movement_insert();

REVOKE ALL ON FUNCTION public.guard_oc_stock_movement_insert()
FROM PUBLIC, anon, authenticated;

-- No se modifica INSERT de movimientos sin OC.
-- BLOQUEADORES antes de instalar:
-- 1. Validar si purchase_order (texto) es usado en entradas independientes
--    para referencias libres: el criterio actual las bloquearía; ajustar
--    al contrato real del frontend antes de desplegar.
-- 2. Auditar funciones SECURITY DEFINER de postgres que insertan movimientos.
-- 3. Verificar que no existan RPCs que permitan suplantar el contexto postgres.
-- 4. Probar con JWT reales: BODEGA directo bloqueado, BODEGA por RPC permitido;
--    ADMIN directo bloqueado; GERENCIA por RPC bloqueado.
-- 5. Verificar recepciones parciales/completas y movimientos independientes.
-- 6. Validar inserciones por service_role y operaciones administrativas.
