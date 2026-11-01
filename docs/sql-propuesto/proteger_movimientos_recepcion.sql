-- BORRADOR PARA REVISIÓN: no ejecutar sin probar los flujos de anulación.
-- Los movimientos asociados a una línea de OC quedan inmutables para usuarios de la API.
-- Los movimientos normales y las entradas excepcionales sin OC no cambian.
-- ATENCIÓN: revisar las funciones de anulación/edición que actualizan o eliminan
-- recepciones; puede ser necesario implementar excepciones explícitas y auditadas.
CREATE OR REPLACE FUNCTION public.guard_purchase_receipt_movement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (
       (TG_OP = 'DELETE' AND OLD.purchase_order_item_id IS NOT NULL)
       OR (TG_OP = 'UPDATE' AND
           (OLD.purchase_order_item_id IS NOT NULL OR NEW.purchase_order_item_id IS NOT NULL))
     ) THEN
    RAISE EXCEPTION 'Una recepción de OC no se modifica directamente; utiliza un proceso de corrección auditado';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_purchase_receipt_movement ON public.stock_movements;
CREATE TRIGGER guard_purchase_receipt_movement
BEFORE UPDATE OR DELETE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_receipt_movement();
