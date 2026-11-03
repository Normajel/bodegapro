-- Security hardening: prevent bypass of document traceability through direct table edits.
-- Preserve legitimate privileged document editing and compensating cancellation flows.
CREATE OR REPLACE FUNCTION private.protect_document_movements()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF current_user <> 'postgres' AND (
      OLD.purchase_order_id IS NOT NULL
      OR OLD.purchase_order_item_id IS NOT NULL
      OR nullif(btrim(OLD.document_number),'') IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.purchase_entry_items item
        WHERE item.stock_movement_id=OLD.id
      )
      OR EXISTS (
        SELECT 1 FROM public.stock_movement_document_cancellations cancellation
        WHERE cancellation.stock_movement_id=OLD.id
      )
      OR coalesce(OLD.reference,'') LIKE 'Anulación%'
  ) THEN
    RAISE EXCEPTION 'Los movimientos vinculados a documentos o anulaciones solo pueden modificarse mediante el proceso autorizado'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS zz_protect_document_movements ON public.stock_movements;
CREATE TRIGGER zz_protect_document_movements
BEFORE UPDATE ON public.stock_movements FOR EACH ROW
EXECUTE FUNCTION private.protect_document_movements();

CREATE OR REPLACE FUNCTION private.protect_purchase_order_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'No elimines órdenes de compra: utiliza la anulación documentada'
      USING ERRCODE='42501';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS zz_protect_purchase_order_delete ON public.purchase_orders;
CREATE TRIGGER zz_protect_purchase_order_delete
BEFORE DELETE ON public.purchase_orders FOR EACH ROW
EXECUTE FUNCTION private.protect_purchase_order_delete();

-- Reject silent line removal in the legacy invoker RPC.
-- Updating existing lines remains possible, but deletion requires an audited document process.
CREATE OR REPLACE FUNCTION public.save_movement_batch(
  payload jsonb, edit_batch uuid DEFAULT NULL::uuid, edit_id uuid DEFAULT NULL::uuid
)
RETURNS SETOF public.stock_movements
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE
  item jsonb;
  bid uuid;
  mid uuid;
  ids uuid[] := '{}';
  movement_kind text;
  v_quantity_value numeric;
  v_product_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión'; END IF;
  IF coalesce(jsonb_typeof(payload->'lines'), '') <> 'array' OR jsonb_array_length(payload->'lines') < 1 THEN
    RAISE EXCEPTION 'Agrega al menos un producto';
  END IF;
  movement_kind := nullif(payload->>'type', '');
  IF coalesce(movement_kind, '') NOT IN ('entrada','salida') THEN RAISE EXCEPTION 'Tipo de movimiento inválido'; END IF;
  IF edit_batch IS NOT NULL OR edit_id IS NOT NULL THEN
    IF public.has_app_permission('movements','edit') IS NOT TRUE
       AND public.has_app_permission('purchases','edit') IS NOT TRUE THEN
       RAISE EXCEPTION 'No tienes permisos para editar movimientos' USING ERRCODE='42501';
    END IF;
  END IF;
  bid := coalesce(edit_batch,gen_random_uuid());
  PERFORM product.id FROM public.products product
    WHERE product.id IN (
      SELECT (line.value->>'product_id')::uuid
      FROM jsonb_array_elements(payload->'lines') AS line(value)
    ) OR product.id IN (
      SELECT movement.product_id FROM public.stock_movements movement
      WHERE movement.batch_id=edit_batch OR movement.id=edit_id
    ) ORDER BY product.id FOR UPDATE;
  FOR item IN SELECT value FROM jsonb_array_elements(payload->'lines') LOOP
    v_product_id := nullif(item->>'product_id','')::uuid;
    v_quantity_value := nullif(item->>'quantity','')::numeric;
    mid := nullif(item->>'id','')::uuid;
    IF v_product_id IS NULL OR v_quantity_value IS NULL OR v_quantity_value <= 0 THEN
      RAISE EXCEPTION 'Revisa el producto y la cantidad; deben ser válidos y mayores a cero';
    END IF;
    IF nullif(btrim(item->>'measure_unit'),'') IS NULL THEN
      RAISE EXCEPTION 'La unidad de medida es obligatoria';
    END IF;
    IF coalesce((item->>'unit_cost')::numeric,-1) < 0 THEN
      RAISE EXCEPTION 'El costo unitario no puede ser negativo';
    END IF;
    IF mid IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.stock_movements movement
        WHERE movement.id=mid AND (movement.batch_id=edit_batch OR movement.id=edit_id)
          AND movement.type=movement_kind
      ) THEN RAISE EXCEPTION 'Movimiento inválido'; END IF;
      UPDATE public.stock_movements SET
        product_id=v_product_id, quantity_value=v_quantity_value,
        quantity=greatest(1,round(v_quantity_value)),measure_unit=item->>'measure_unit',
        unit_cost=(item->>'unit_cost')::numeric,
        supplier_id=nullif(payload->>'supplier_id','')::uuid,
        customer_id=nullif(payload->>'customer_id','')::uuid,
        reference=nullif(payload->>'reference',''),
        notes=nullif(payload->>'notes',''),
        unit_type=nullif(payload->>'unit_type',''),
        unit_type_value=nullif(payload->>'unit_type_value',''),
        purchase_order=nullif(payload->>'purchase_order',''),
        document_type=nullif(payload->>'document_type',''),
        document_number=nullif(payload->>'document_number','')
      WHERE id=mid;
    ELSE
      INSERT INTO public.stock_movements (
        product_id,type,quantity,quantity_value,measure_unit,unit_cost,
        supplier_id,customer_id,reference,notes,unit_type,unit_type_value,
        purchase_order,document_type,document_number,batch_id,created_by
      ) VALUES (
        v_product_id,movement_kind,greatest(1,round(v_quantity_value)),v_quantity_value,
        item->>'measure_unit',(item->>'unit_cost')::numeric,
        nullif(payload->>'supplier_id','')::uuid,nullif(payload->>'customer_id','')::uuid,
        nullif(payload->>'reference',''),nullif(payload->>'notes',''),
        nullif(payload->>'unit_type',''),nullif(payload->>'unit_type_value',''),
        nullif(payload->>'purchase_order',''),nullif(payload->>'document_type',''),
        nullif(payload->>'document_number',''),bid,auth.uid()
      ) RETURNING id INTO mid;
    END IF;
    ids := array_append(ids,mid);
  END LOOP;
  IF edit_batch IS NOT NULL OR edit_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.stock_movements
      WHERE (batch_id=edit_batch OR id=edit_id)
        AND NOT (id=ANY(ids))
    ) THEN
      RAISE EXCEPTION 'No puedes quitar líneas de un movimiento registrado. Anula el documento con motivo y registra uno nuevo';
    END IF;
  END IF;
  RETURN QUERY
  SELECT movement.* FROM public.stock_movements movement
  WHERE movement.id=ANY(ids) ORDER BY movement.created_at,movement.id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_movement_batch(jsonb,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_movement_batch(jsonb,uuid,uuid) TO authenticated;
