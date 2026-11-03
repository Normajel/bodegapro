-- BodegaPro: protect purchase-order receipt totals, state transitions and movement deletion.
-- Legitimate receive_purchase_order and documented cancellation RPCs retain their flows.
CREATE OR REPLACE FUNCTION private.guard_purchase_line_receipt()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF NEW.received_quantity IS DISTINCT FROM OLD.received_quantity
     AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'La cantidad recepcionada solo puede modificarse mediante la recepción autorizada de una OC'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS zz_guard_purchase_line_receipt ON public.purchase_order_items;
CREATE TRIGGER zz_guard_purchase_line_receipt
  BEFORE UPDATE OF received_quantity ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION private.guard_purchase_line_receipt();

CREATE OR REPLACE FUNCTION private.guard_purchase_order_state()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF current_user <> 'postgres' THEN
      RAISE EXCEPTION 'El estado de la OC solo puede modificarse mediante el proceso autorizado'
        USING ERRCODE='42501';
    END IF;
    IF NEW.status IN ('parcial','completa') AND NEW.approval_status <> 'aprobada' THEN
      RAISE EXCEPTION 'No se puede recepcionar una orden no aprobada';
    END IF;
    IF NEW.status='completa' AND EXISTS (
      SELECT 1 FROM public.purchase_order_items line
      WHERE line.purchase_order_id=NEW.id AND line.item_type='producto'
        AND line.received_quantity < line.quantity
    ) THEN
      RAISE EXCEPTION 'No puede completarse una OC con productos pendientes';
    END IF;
    IF NEW.status='parcial' AND NOT EXISTS (
      SELECT 1 FROM public.purchase_order_items line
      WHERE line.purchase_order_id=NEW.id AND line.item_type='producto'
        AND line.received_quantity > 0
    ) THEN
      RAISE EXCEPTION 'No puede marcarse una OC como parcial sin recepciones';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS zz_guard_purchase_order_state ON public.purchase_orders;
CREATE TRIGGER zz_guard_purchase_order_state
  BEFORE UPDATE OF status ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION private.guard_purchase_order_state();

-- Cancellation of OC must be performed using a guarded privileged RPC.
CREATE OR REPLACE FUNCTION public.cancel_purchase_order(p_order_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  current_order public.purchase_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL
     OR public.has_app_permission('purchases','delete') IS NOT TRUE
     OR public.has_app_permission('purchases','edit') IS NOT TRUE THEN
    RAISE EXCEPTION 'No tienes permisos para anular órdenes de compra' USING ERRCODE='42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Debes indicar un motivo de anulación de al menos 10 caracteres';
  END IF;
  SELECT * INTO current_order FROM public.purchase_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden de compra no encontrada'; END IF;
  IF current_order.status <> 'pendiente' OR EXISTS (
    SELECT 1 FROM public.purchase_order_items WHERE purchase_order_id=p_order_id AND received_quantity>0
  ) THEN
    RAISE EXCEPTION 'Solo pueden anularse órdenes pendientes sin recepciones';
  END IF;
  UPDATE public.purchase_orders
    SET status='anulada', cancellation_reason=btrim(p_reason), updated_at=now()
    WHERE id=p_order_id;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_purchase_order(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_purchase_order(uuid,text) TO authenticated;

-- Do not physically delete ledger movements through the public table API.
CREATE OR REPLACE FUNCTION private.guard_direct_movement_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'No se permite borrar movimientos directamente. Registra una anulación documentada'
      USING ERRCODE='42501';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS zz_guard_direct_movement_delete ON public.stock_movements;
CREATE TRIGGER zz_guard_direct_movement_delete
  BEFORE DELETE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION private.guard_direct_movement_delete();

-- A single unlinked manual movement is cancelled by an immutable audit record
-- and the opposite stock movement. Original movement is retained.
CREATE OR REPLACE FUNCTION public.cancel_single_movement(p_movement_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  source public.stock_movements%ROWTYPE;
  audit_id uuid := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE='42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Debes indicar un motivo de anulación de al menos 10 caracteres';
  END IF;
  SELECT * INTO source FROM public.stock_movements WHERE id=p_movement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento no encontrado'; END IF;
  IF (source.type='entrada' AND public.has_app_permission('purchases','delete') IS NOT TRUE)
     OR (source.type='salida' AND public.has_app_permission('movements','delete') IS NOT TRUE) THEN
    RAISE EXCEPTION 'No tienes permiso para anular este movimiento' USING ERRCODE='42501';
  END IF;
  IF source.purchase_order_id IS NOT NULL OR source.purchase_order_item_id IS NOT NULL
     OR source.document_number IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.purchase_entry_items i WHERE i.stock_movement_id=source.id) THEN
    RAISE EXCEPTION 'Este movimiento debe anularse mediante el documento de compra o venta';
  END IF;
  IF source.batch_id IS NOT NULL AND (
    SELECT count(*) FROM public.stock_movements m WHERE m.batch_id=source.batch_id
  ) > 1 THEN
    RAISE EXCEPTION 'El movimiento pertenece a un grupo: anula el documento completo';
  END IF;
  IF source.reference LIKE 'Anulación%' OR EXISTS (
    SELECT 1 FROM public.stock_movement_document_cancellations c WHERE c.stock_movement_id=source.id
  ) THEN
    RAISE EXCEPTION 'El movimiento ya fue anulado o es un movimiento compensatorio';
  END IF;
  INSERT INTO public.stock_movement_document_cancellations
    (stock_movement_id,cancellation_id,cancelled_by,cancellation_reason)
    VALUES (source.id,audit_id,auth.uid(),btrim(p_reason));
  INSERT INTO public.stock_movements
    (product_id,type,quantity,quantity_value,measure_unit,unit_cost,supplier_id,customer_id,
     reference,notes,created_by)
  VALUES
    (source.product_id,CASE WHEN source.type='entrada' THEN 'salida' ELSE 'entrada' END,
     source.quantity,source.quantity_value,source.measure_unit,source.unit_cost,
     source.supplier_id,source.customer_id,
     'Anulación individual: '||source.folio::text,btrim(p_reason),auth.uid());
  RETURN audit_id;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_single_movement(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_single_movement(uuid,text) TO authenticated;