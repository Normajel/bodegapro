CREATE OR REPLACE FUNCTION public.anular_salida_documento(
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
  movement_row public.stock_movements%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;
  IF NOT public.has_app_permission('movements', 'delete') THEN
    RAISE EXCEPTION 'No tienes permiso para anular ventas';
  END IF;
  IF coalesce(cardinality(p_movement_ids), 0) = 0
     OR cardinality(p_movement_ids) <> (
       SELECT count(DISTINCT movement_id)
       FROM unnest(p_movement_ids) AS ids(movement_id)
     ) THEN
    RAISE EXCEPTION 'El documento seleccionado no es válido';
  END IF;

  SELECT source.* INTO first_movement
  FROM public.stock_movements source
  WHERE source.id = p_movement_ids[1]
  FOR UPDATE;
  IF NOT FOUND OR first_movement.type <> 'salida' THEN
    RAISE EXCEPTION 'No se encontró la venta seleccionada';
  END IF;

  PERFORM source.id
  FROM public.stock_movements source
  WHERE source.id = ANY(p_movement_ids)
  ORDER BY source.id
  FOR UPDATE;

  IF first_movement.batch_id IS NOT NULL THEN
    SELECT count(*) INTO expected_count
    FROM public.stock_movements source
    WHERE source.batch_id = first_movement.batch_id
      AND source.type = 'salida';
  ELSE
    SELECT count(*) INTO expected_count
    FROM public.stock_movements source
    WHERE source.batch_id IS NULL
      AND source.type = 'salida'
      AND source.document_type IS NOT DISTINCT FROM first_movement.document_type
      AND source.document_number IS NOT DISTINCT FROM first_movement.document_number
      AND source.purchase_order IS NOT DISTINCT FROM first_movement.purchase_order
      AND source.customer_id IS NOT DISTINCT FROM first_movement.customer_id
      AND source.created_at::date = first_movement.created_at::date;
  END IF;

  SELECT count(*) INTO provided_count
  FROM public.stock_movements source
  WHERE source.id = ANY(p_movement_ids)
    AND source.type = 'salida'
    AND (
      (first_movement.batch_id IS NOT NULL AND source.batch_id = first_movement.batch_id)
      OR (
        first_movement.batch_id IS NULL
        AND source.batch_id IS NULL
        AND source.document_type IS NOT DISTINCT FROM first_movement.document_type
        AND source.document_number IS NOT DISTINCT FROM first_movement.document_number
        AND source.purchase_order IS NOT DISTINCT FROM first_movement.purchase_order
        AND source.customer_id IS NOT DISTINCT FROM first_movement.customer_id
        AND source.created_at::date = first_movement.created_at::date
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
    RAISE EXCEPTION 'Una venta no puede estar vinculada a una compra';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.stock_movement_document_cancellations cancellation
    WHERE cancellation.stock_movement_id = ANY(p_movement_ids)
  ) THEN
    RAISE EXCEPTION 'Esta venta ya fue anulada';
  END IF;

  INSERT INTO public.stock_movement_document_cancellations (
    stock_movement_id, cancellation_id, cancelled_by, cancellation_reason
  )
  SELECT source.id, cancellation_ref, auth.uid(), nullif(btrim(p_reason), '')
  FROM public.stock_movements source
  WHERE source.id = ANY(p_movement_ids);

  FOR movement_row IN
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
      movement_row.product_id,
      'entrada',
      movement_row.quantity,
      coalesce(movement_row.quantity_value, movement_row.quantity),
      movement_row.measure_unit,
      movement_row.unit_cost,
      'Anulación de venta: ' || coalesce(movement_row.document_number, movement_row.folio::text, movement_row.id::text),
      nullif(btrim(p_reason), ''),
      auth.uid()
    );
  END LOOP;

  RETURN cancellation_ref;
END;
$$;

REVOKE ALL ON FUNCTION public.anular_salida_documento(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anular_salida_documento(uuid[], text) TO authenticated;

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
  movement_row public.stock_movements%ROWTYPE;
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

  SELECT source.* INTO first_movement
  FROM public.stock_movements source
  WHERE source.id = p_movement_ids[1]
  FOR UPDATE;
  IF NOT FOUND OR first_movement.type <> 'entrada' THEN
    RAISE EXCEPTION 'No se encontró la compra seleccionada';
  END IF;

  PERFORM source.id
  FROM public.stock_movements source
  WHERE source.id = ANY(p_movement_ids)
  ORDER BY source.id
  FOR UPDATE;

  IF first_movement.batch_id IS NOT NULL THEN
    SELECT count(*) INTO expected_count
    FROM public.stock_movements source
    WHERE source.batch_id = first_movement.batch_id
      AND source.type = 'entrada';
  ELSE
    SELECT count(*) INTO expected_count
    FROM public.stock_movements source
    WHERE source.batch_id IS NULL
      AND source.type = 'entrada'
      AND source.document_type IS NOT DISTINCT FROM first_movement.document_type
      AND source.document_number IS NOT DISTINCT FROM first_movement.document_number
      AND source.purchase_order IS NOT DISTINCT FROM first_movement.purchase_order
      AND source.supplier_id IS NOT DISTINCT FROM first_movement.supplier_id
      AND source.created_at::date = first_movement.created_at::date;
  END IF;

  SELECT count(*) INTO provided_count
  FROM public.stock_movements source
  WHERE source.id = ANY(p_movement_ids)
    AND source.type = 'entrada'
    AND (
      (first_movement.batch_id IS NOT NULL AND source.batch_id = first_movement.batch_id)
      OR (
        first_movement.batch_id IS NULL
        AND source.batch_id IS NULL
        AND source.document_type IS NOT DISTINCT FROM first_movement.document_type
        AND source.document_number IS NOT DISTINCT FROM first_movement.document_number
        AND source.purchase_order IS NOT DISTINCT FROM first_movement.purchase_order
        AND source.supplier_id IS NOT DISTINCT FROM first_movement.supplier_id
        AND source.created_at::date = first_movement.created_at::date
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
  SELECT source.id, cancellation_ref, auth.uid(), nullif(btrim(p_reason), '')
  FROM public.stock_movements source
  WHERE source.id = ANY(p_movement_ids);

  FOR movement_row IN
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
      movement_row.product_id,
      'salida',
      movement_row.quantity,
      coalesce(movement_row.quantity_value, movement_row.quantity),
      movement_row.measure_unit,
      movement_row.unit_cost,
      'Anulación de compra: ' || coalesce(movement_row.document_number, movement_row.folio::text, movement_row.id::text),
      nullif(btrim(p_reason), ''),
      auth.uid()
    );
  END LOOP;

  RETURN cancellation_ref;
END;
$$;

REVOKE ALL ON FUNCTION public.anular_entrada_documento(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anular_entrada_documento(uuid[], text) TO authenticated;
