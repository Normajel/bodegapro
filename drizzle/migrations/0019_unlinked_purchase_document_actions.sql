-- Editar y anular compras registradas como movimientos de entrada que no
-- están vinculadas a una orden en purchase_entries.

CREATE OR REPLACE FUNCTION public.anular_entrada_documento(
  p_movement_ids uuid[],
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  first_movement public.stock_movements%ROWTYPE;
  expected_count integer;
  provided_count integer;
  cancellation_ref uuid := gen_random_uuid();
  movement public.stock_movements%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;
  IF NOT public.has_app_permission('purchases', 'delete') THEN
    RAISE EXCEPTION 'No tienes permiso para anular compras';
  END IF;
  IF coalesce(cardinality(p_movement_ids), 0) = 0
     OR cardinality(p_movement_ids) <> (
       SELECT count(DISTINCT movement_id)
       FROM unnest(p_movement_ids) AS ids(movement_id)
     ) THEN
    RAISE EXCEPTION 'El documento seleccionado no es válido';
  END IF;

  SELECT movement.* INTO first_movement
  FROM public.stock_movements movement
  WHERE movement.id = p_movement_ids[1]
  FOR UPDATE;
  IF NOT FOUND OR first_movement.type <> 'entrada' THEN
    RAISE EXCEPTION 'No se encontró la compra seleccionada';
  END IF;

  PERFORM movement.id
  FROM public.stock_movements movement
  WHERE movement.id = ANY(p_movement_ids)
  ORDER BY movement.id
  FOR UPDATE;

  IF first_movement.batch_id IS NOT NULL THEN
    SELECT count(*) INTO expected_count
    FROM public.stock_movements movement
    WHERE movement.batch_id = first_movement.batch_id
      AND movement.type = 'entrada';
  ELSE
    SELECT count(*) INTO expected_count
    FROM public.stock_movements movement
    WHERE movement.batch_id IS NULL
      AND movement.type = 'entrada'
      AND movement.document_type IS NOT DISTINCT FROM first_movement.document_type
      AND movement.document_number IS NOT DISTINCT FROM first_movement.document_number
      AND movement.purchase_order IS NOT DISTINCT FROM first_movement.purchase_order
      AND movement.supplier_id IS NOT DISTINCT FROM first_movement.supplier_id
      AND movement.created_at::date = first_movement.created_at::date;
  END IF;

  SELECT count(*) INTO provided_count
  FROM public.stock_movements movement
  WHERE movement.id = ANY(p_movement_ids)
    AND movement.type = 'entrada'
    AND (
      (first_movement.batch_id IS NOT NULL AND movement.batch_id = first_movement.batch_id)
      OR (
        first_movement.batch_id IS NULL
        AND movement.batch_id IS NULL
        AND movement.document_type IS NOT DISTINCT FROM first_movement.document_type
        AND movement.document_number IS NOT DISTINCT FROM first_movement.document_number
        AND movement.purchase_order IS NOT DISTINCT FROM first_movement.purchase_order
        AND movement.supplier_id IS NOT DISTINCT FROM first_movement.supplier_id
        AND movement.created_at::date = first_movement.created_at::date
      )
    );

  IF expected_count = 0 OR provided_count <> expected_count
     OR cardinality(p_movement_ids) <> expected_count THEN
    RAISE EXCEPTION 'Debes anular todas las líneas del documento seleccionado';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.purchase_entry_items item
    WHERE item.stock_movement_id = ANY(p_movement_ids)
  ) THEN
    RAISE EXCEPTION 'Esta compra está vinculada a una orden de compra; anúlala desde ahí';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.stock_movement_document_cancellations cancellation
    WHERE cancellation.stock_movement_id = ANY(p_movement_ids)
  ) THEN
    RAISE EXCEPTION 'Esta compra ya fue anulada';
  END IF;

  INSERT INTO public.stock_movement_document_cancellations (
    stock_movement_id, cancellation_id, cancelled_by, cancellation_reason
  )
  SELECT movement.id, cancellation_ref, auth.uid(), nullif(btrim(p_reason), '')
  FROM public.stock_movements movement
  WHERE movement.id = ANY(p_movement_ids);

  FOR movement IN
    SELECT source.*
    FROM public.stock_movements source
    WHERE source.id = ANY(p_movement_ids)
    ORDER BY source.product_id, source.id
  LOOP
    INSERT INTO public.stock_movements (
      product_id, type, quantity, quantity_value, measure_unit, unit_cost,
      reference, notes, created_by
    )
    VALUES (
      movement.product_id,
      'salida',
      movement.quantity,
      coalesce(movement.quantity_value, movement.quantity),
      movement.measure_unit,
      movement.unit_cost,
      'Anulación de compra: ' || coalesce(movement.document_number, movement.folio::text, movement.id::text),
      nullif(btrim(p_reason), ''),
      auth.uid()
    );
  END LOOP;

  RETURN cancellation_ref;
END;
$$;

REVOKE ALL ON FUNCTION public.anular_entrada_documento(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anular_entrada_documento(uuid[], text) TO authenticated;

CREATE OR REPLACE FUNCTION public.editar_entrada_documento(
  p_movement_ids uuid[],
  p_payload jsonb
)
RETURNS SETOF public.stock_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  first_movement public.stock_movements%ROWTYPE;
  item jsonb;
  current_movement public.stock_movements%ROWTYPE;
  movement_id uuid;
  batch_ref uuid;
  expected_count integer;
  provided_count integer;
  saved_ids uuid[] := '{}';
  item_quantity numeric;
  item_product_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;
  IF NOT public.has_app_permission('purchases', 'edit') THEN
    RAISE EXCEPTION 'No tienes permiso para editar compras';
  END IF;
  IF coalesce(jsonb_typeof(p_payload->'lines'), '') <> 'array'
     OR jsonb_array_length(p_payload->'lines') = 0 THEN
    RAISE EXCEPTION 'Agrega al menos un producto';
  END IF;
  IF coalesce(cardinality(p_movement_ids), 0) = 0 THEN
    RAISE EXCEPTION 'El documento seleccionado no es válido';
  END IF;
  IF cardinality(p_movement_ids) <> (
    SELECT count(DISTINCT movement_id)
    FROM unnest(p_movement_ids) AS ids(movement_id)
  ) THEN
    RAISE EXCEPTION 'El documento seleccionado contiene líneas duplicadas';
  END IF;
  IF nullif(btrim(p_payload->>'document_number'), '') IS NULL THEN
    RAISE EXCEPTION 'Revisa el tipo y número del documento';
  END IF;

  SELECT movement.* INTO first_movement
  FROM public.stock_movements movement
  WHERE movement.id = p_movement_ids[1]
  FOR UPDATE;
  IF NOT FOUND OR first_movement.type <> 'entrada' THEN
    RAISE EXCEPTION 'No se encontró la compra seleccionada';
  END IF;

  PERFORM movement.id
  FROM public.stock_movements movement
  WHERE movement.id = ANY(p_movement_ids)
  ORDER BY movement.id
  FOR UPDATE;

  IF first_movement.batch_id IS NOT NULL THEN
    SELECT count(*) INTO expected_count
    FROM public.stock_movements movement
    WHERE movement.batch_id = first_movement.batch_id
      AND movement.type = 'entrada';
  ELSE
    SELECT count(*) INTO expected_count
    FROM public.stock_movements movement
    WHERE movement.batch_id IS NULL
      AND movement.type = 'entrada'
      AND movement.document_type IS NOT DISTINCT FROM first_movement.document_type
      AND movement.document_number IS NOT DISTINCT FROM first_movement.document_number
      AND movement.purchase_order IS NOT DISTINCT FROM first_movement.purchase_order
      AND movement.supplier_id IS NOT DISTINCT FROM first_movement.supplier_id
      AND movement.created_at::date = first_movement.created_at::date;
  END IF;
  SELECT count(*) INTO provided_count
  FROM public.stock_movements movement
  WHERE movement.id = ANY(p_movement_ids)
    AND movement.type = 'entrada'
    AND (
      (first_movement.batch_id IS NOT NULL AND movement.batch_id = first_movement.batch_id)
      OR (
        first_movement.batch_id IS NULL
        AND movement.batch_id IS NULL
        AND movement.document_type IS NOT DISTINCT FROM first_movement.document_type
        AND movement.document_number IS NOT DISTINCT FROM first_movement.document_number
        AND movement.purchase_order IS NOT DISTINCT FROM first_movement.purchase_order
        AND movement.supplier_id IS NOT DISTINCT FROM first_movement.supplier_id
        AND movement.created_at::date = first_movement.created_at::date
      )
    );
  IF expected_count = 0 OR provided_count <> expected_count
     OR cardinality(p_movement_ids) <> expected_count THEN
    RAISE EXCEPTION 'El documento cambió. Actualiza la página e inténtalo nuevamente';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.stock_movement_document_cancellations cancellation
    WHERE cancellation.stock_movement_id = ANY(p_movement_ids)
  ) THEN
    RAISE EXCEPTION 'No se puede editar una compra anulada';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.purchase_entry_items entry_item
    WHERE entry_item.stock_movement_id = ANY(p_movement_ids)
  ) THEN
    RAISE EXCEPTION 'La compra está vinculada a una orden de compra; edítala desde ahí';
  END IF;

  batch_ref := coalesce(first_movement.batch_id, gen_random_uuid());
  IF first_movement.batch_id IS NULL THEN
    UPDATE public.stock_movements
    SET batch_id = batch_ref
    WHERE id = ANY(p_movement_ids);
  END IF;

  PERFORM product.id
  FROM public.products product
  WHERE product.id IN (
    SELECT nullif(line.value->>'product_id', '')::uuid
    FROM jsonb_array_elements(p_payload->'lines') AS line(value)
  )
  OR product.id IN (
    SELECT movement.product_id
    FROM public.stock_movements movement
    WHERE movement.id = ANY(p_movement_ids)
  )
  ORDER BY product.id
  FOR UPDATE;

  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'lines') LOOP
    item_product_id := nullif(item->>'product_id', '')::uuid;
    item_quantity := nullif(item->>'quantity', '')::numeric;
    movement_id := nullif(item->>'id', '')::uuid;
    IF item_product_id IS NULL OR item_quantity IS NULL OR item_quantity <= 0
       OR nullif(btrim(item->>'measure_unit'), '') IS NULL
       OR coalesce((item->>'unit_cost')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'Revisa el producto, cantidad, unidad y precio';
    END IF;

    IF movement_id IS NOT NULL THEN
      SELECT movement.* INTO current_movement
      FROM public.stock_movements movement
      WHERE movement.id = movement_id
        AND movement.id = ANY(p_movement_ids)
        AND movement.type = 'entrada'
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Una línea enviada no pertenece a esta compra';
      END IF;

      UPDATE public.stock_movements
      SET product_id = item_product_id,
          quantity_value = item_quantity,
          quantity = greatest(1, round(item_quantity)::integer),
          measure_unit = item->>'measure_unit',
          unit_cost = (item->>'unit_cost')::numeric,
          supplier_id = nullif(p_payload->>'supplier_id', '')::uuid,
          notes = nullif(p_payload->>'notes', ''),
          purchase_order = nullif(p_payload->>'purchase_order', ''),
          document_type = nullif(p_payload->>'document_type', ''),
          document_number = nullif(p_payload->>'document_number', '')
      WHERE id = movement_id;
    ELSE
      INSERT INTO public.stock_movements (
        product_id, type, quantity, quantity_value, measure_unit, unit_cost,
        supplier_id, notes, purchase_order, document_type, document_number,
        batch_id, created_by
      )
      VALUES (
        item_product_id, 'entrada', greatest(1, round(item_quantity)::integer),
        item_quantity, item->>'measure_unit', (item->>'unit_cost')::numeric,
        nullif(p_payload->>'supplier_id', '')::uuid,
        nullif(p_payload->>'notes', ''),
        nullif(p_payload->>'purchase_order', ''), nullif(p_payload->>'document_type', ''),
        nullif(p_payload->>'document_number', ''), batch_ref, auth.uid()
      )
      RETURNING id INTO movement_id;
    END IF;
    saved_ids := array_append(saved_ids, movement_id);
  END LOOP;

  DELETE FROM public.stock_movements movement
  WHERE movement.id = ANY(p_movement_ids)
    AND NOT (movement.id = ANY(saved_ids));

  RETURN QUERY
  SELECT movement.*
  FROM public.stock_movements movement
  WHERE movement.id = ANY(saved_ids)
  ORDER BY movement.created_at, movement.id;
END;
$$;

REVOKE ALL ON FUNCTION public.editar_entrada_documento(uuid[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_entrada_documento(uuid[], jsonb) TO authenticated;
