CREATE OR REPLACE FUNCTION public.sync_stock_movement_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  old_stock integer;
  new_stock integer;
  old_delta integer;
  new_delta integer;
BEGIN
  PERFORM product.id
  FROM public.products product
  WHERE product.id IN (OLD.product_id, NEW.product_id)
  ORDER BY product.id
  FOR UPDATE;

  old_delta := CASE WHEN OLD.type = 'entrada' THEN OLD.quantity ELSE -OLD.quantity END;
  new_delta := CASE WHEN NEW.type = 'entrada' THEN NEW.quantity ELSE -NEW.quantity END;

  IF OLD.product_id = NEW.product_id THEN
    SELECT product.stock INTO old_stock
    FROM public.products product
    WHERE product.id = NEW.product_id;

    new_stock := old_stock - old_delta + new_delta;
    IF new_stock < 0 THEN
      RAISE EXCEPTION 'Stock insuficiente para modificar la salida. Disponible %, solicitado %',
        old_stock - old_delta, NEW.quantity;
    END IF;

    UPDATE public.products
    SET stock = new_stock, updated_at = now()
    WHERE id = NEW.product_id;
  ELSE
    SELECT product.stock INTO old_stock
    FROM public.products product
    WHERE product.id = OLD.product_id;
    SELECT product.stock INTO new_stock
    FROM public.products product
    WHERE product.id = NEW.product_id;

    IF NEW.type = 'salida' AND new_stock < NEW.quantity THEN
      RAISE EXCEPTION 'Stock insuficiente: disponible %, solicitado %', new_stock, NEW.quantity;
    END IF;
    IF OLD.type = 'entrada' AND old_stock < OLD.quantity THEN
      RAISE EXCEPTION 'No se puede reducir o mover la compra: parte del stock ya fue utilizado';
    END IF;

    UPDATE public.products
    SET stock = stock - old_delta, updated_at = now()
    WHERE id = OLD.product_id;
    UPDATE public.products
    SET stock = stock + new_delta, updated_at = now()
    WHERE id = NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_stock_movement_update ON public.stock_movements;
CREATE TRIGGER on_stock_movement_update
  AFTER UPDATE OF product_id, type, quantity ON public.stock_movements
  FOR EACH ROW
  WHEN (
    OLD.product_id IS DISTINCT FROM NEW.product_id
    OR OLD.type IS DISTINCT FROM NEW.type
    OR OLD.quantity IS DISTINCT FROM NEW.quantity
  )
  EXECUTE FUNCTION public.sync_stock_movement_update();

CREATE TABLE IF NOT EXISTS public.stock_movement_document_cancellations (
  stock_movement_id uuid PRIMARY KEY REFERENCES public.stock_movements(id) ON DELETE RESTRICT,
  cancellation_id uuid NOT NULL,
  cancelled_at timestamptz NOT NULL DEFAULT now(),
  cancelled_by uuid NOT NULL REFERENCES auth.users(id),
  cancellation_reason text
);

ALTER TABLE public.stock_movement_document_cancellations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.stock_movement_document_cancellations TO authenticated;
DROP POLICY IF EXISTS "Read movement document cancellations"
  ON public.stock_movement_document_cancellations;
CREATE POLICY "Read movement document cancellations"
  ON public.stock_movement_document_cancellations
  FOR SELECT TO authenticated
  USING (public.has_app_permission('movements', 'view'));

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
  movement public.stock_movements%ROWTYPE;
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

  SELECT movement.* INTO first_movement
  FROM public.stock_movements movement
  WHERE movement.id = p_movement_ids[1]
  FOR UPDATE;
  IF NOT FOUND OR first_movement.type <> 'salida' THEN
    RAISE EXCEPTION 'No se encontró la venta seleccionada';
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
      AND movement.type = 'salida';
  ELSE
    SELECT count(*) INTO expected_count
    FROM public.stock_movements movement
    WHERE movement.batch_id IS NULL
      AND movement.type = 'salida'
      AND movement.document_type IS NOT DISTINCT FROM first_movement.document_type
      AND movement.document_number IS NOT DISTINCT FROM first_movement.document_number
      AND movement.purchase_order IS NOT DISTINCT FROM first_movement.purchase_order
      AND movement.customer_id IS NOT DISTINCT FROM first_movement.customer_id
      AND movement.created_at::date = first_movement.created_at::date;
  END IF;

  SELECT count(*) INTO provided_count
  FROM public.stock_movements movement
  WHERE movement.id = ANY(p_movement_ids)
    AND movement.type = 'salida'
    AND (
      (first_movement.batch_id IS NOT NULL AND movement.batch_id = first_movement.batch_id)
      OR (
        first_movement.batch_id IS NULL
        AND movement.batch_id IS NULL
        AND movement.document_type IS NOT DISTINCT FROM first_movement.document_type
        AND movement.document_number IS NOT DISTINCT FROM first_movement.document_number
        AND movement.purchase_order IS NOT DISTINCT FROM first_movement.purchase_order
        AND movement.customer_id IS NOT DISTINCT FROM first_movement.customer_id
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
      'entrada',
      movement.quantity,
      coalesce(movement.quantity_value, movement.quantity),
      movement.measure_unit,
      movement.unit_cost,
      'Anulación de venta: ' || coalesce(movement.document_number, movement.folio::text, movement.id::text),
      nullif(btrim(p_reason), ''),
      auth.uid()
    );
  END LOOP;

  RETURN cancellation_ref;
END;
$$;

REVOKE ALL ON FUNCTION public.anular_salida_documento(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anular_salida_documento(uuid[], text) TO authenticated;

CREATE OR REPLACE FUNCTION public.editar_salida_documento(
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
  IF NOT public.has_app_permission('movements', 'edit') THEN
    RAISE EXCEPTION 'No tienes permiso para editar ventas';
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

  SELECT movement.* INTO first_movement
  FROM public.stock_movements movement
  WHERE movement.id = p_movement_ids[1]
  FOR UPDATE;
  IF NOT FOUND OR first_movement.type <> 'salida' THEN
    RAISE EXCEPTION 'No se encontró la venta seleccionada';
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
      AND movement.type = 'salida';
  ELSE
    SELECT count(*) INTO expected_count
    FROM public.stock_movements movement
    WHERE movement.batch_id IS NULL
      AND movement.type = 'salida'
      AND movement.document_type IS NOT DISTINCT FROM first_movement.document_type
      AND movement.document_number IS NOT DISTINCT FROM first_movement.document_number
      AND movement.purchase_order IS NOT DISTINCT FROM first_movement.purchase_order
      AND movement.customer_id IS NOT DISTINCT FROM first_movement.customer_id
      AND movement.created_at::date = first_movement.created_at::date;
  END IF;
  SELECT count(*) INTO provided_count
  FROM public.stock_movements movement
  WHERE movement.id = ANY(p_movement_ids)
    AND movement.type = 'salida'
    AND (
      (first_movement.batch_id IS NOT NULL AND movement.batch_id = first_movement.batch_id)
      OR (
        first_movement.batch_id IS NULL
        AND movement.batch_id IS NULL
        AND movement.document_type IS NOT DISTINCT FROM first_movement.document_type
        AND movement.document_number IS NOT DISTINCT FROM first_movement.document_number
        AND movement.purchase_order IS NOT DISTINCT FROM first_movement.purchase_order
        AND movement.customer_id IS NOT DISTINCT FROM first_movement.customer_id
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
    RAISE EXCEPTION 'No se puede editar una venta anulada';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.purchase_entry_items entry_item
    WHERE entry_item.stock_movement_id = ANY(p_movement_ids)
  ) THEN
    RAISE EXCEPTION 'El documento está vinculado a una compra';
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
        AND movement.type = 'salida'
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Una línea enviada no pertenece a esta venta';
      END IF;

      UPDATE public.stock_movements
      SET product_id = item_product_id,
          quantity_value = item_quantity,
          quantity = greatest(1, round(item_quantity)::integer),
          measure_unit = item->>'measure_unit',
          unit_cost = (item->>'unit_cost')::numeric,
          customer_id = nullif(p_payload->>'customer_id', '')::uuid,
          reference = nullif(p_payload->>'reference', ''),
          notes = nullif(p_payload->>'notes', ''),
          unit_type = nullif(p_payload->>'unit_type', ''),
          unit_type_value = nullif(p_payload->>'unit_type_value', ''),
          purchase_order = nullif(p_payload->>'purchase_order', ''),
          document_type = nullif(p_payload->>'document_type', ''),
          document_number = nullif(p_payload->>'document_number', '')
      WHERE id = movement_id;
    ELSE
      INSERT INTO public.stock_movements (
        product_id, type, quantity, quantity_value, measure_unit, unit_cost,
        customer_id, reference, notes, unit_type, unit_type_value,
        purchase_order, document_type, document_number, batch_id, created_by
      )
      VALUES (
        item_product_id, 'salida', greatest(1, round(item_quantity)::integer),
        item_quantity, item->>'measure_unit', (item->>'unit_cost')::numeric,
        nullif(p_payload->>'customer_id', '')::uuid,
        nullif(p_payload->>'reference', ''), nullif(p_payload->>'notes', ''),
        nullif(p_payload->>'unit_type', ''), nullif(p_payload->>'unit_type_value', ''),
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

REVOKE ALL ON FUNCTION public.editar_salida_documento(uuid[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_salida_documento(uuid[], jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.editar_entrada_compra(
  p_purchase_entry_id uuid,
  p_supplier_id uuid,
  p_purchase_order text,
  p_document_type text,
  p_document_number text,
  p_notes text,
  p_items jsonb
)
RETURNS SETOF public.stock_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  entry_cancelled_at timestamptz;
  item jsonb;
  current_item public.purchase_entry_items%ROWTYPE;
  current_movement public.stock_movements%ROWTYPE;
  movement_id uuid;
  v_product_id uuid;
  item_quantity numeric;
  current_stock integer;
  batch_ref uuid := gen_random_uuid();
  saved_ids uuid[] := '{}';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;
  IF NOT public.has_app_permission('purchases', 'edit') THEN
    RAISE EXCEPTION 'No tienes permiso para editar compras';
  END IF;
  IF coalesce(jsonb_typeof(p_items), '') <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Agrega al menos un producto';
  END IF;
  IF (
    SELECT count(*) <> count(DISTINCT nullif(line.value->>'id', '')::uuid)
    FROM jsonb_array_elements(p_items) AS line(value)
    WHERE nullif(line.value->>'id', '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'La compra contiene líneas duplicadas';
  END IF;
  IF nullif(btrim(p_document_number), '') IS NULL
     OR p_document_type NOT IN ('factura', 'guia_despacho') THEN
    RAISE EXCEPTION 'Revisa el tipo y número del documento';
  END IF;

  SELECT entry.cancelled_at INTO entry_cancelled_at
  FROM public.purchase_entries entry
  WHERE entry.id = p_purchase_entry_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la compra';
  END IF;
  IF entry_cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede editar una compra anulada';
  END IF;

  PERFORM product.id
  FROM public.products product
  WHERE product.id IN (
    SELECT nullif(line.value->>'product_id', '')::uuid
    FROM jsonb_array_elements(p_items) AS line(value)
  )
  OR product.id IN (
    SELECT entry_item.product_id
    FROM public.purchase_entry_items entry_item
    WHERE entry_item.purchase_entry_id = p_purchase_entry_id
  )
  ORDER BY product.id
  FOR UPDATE;

  UPDATE public.purchase_entries
  SET supplier_id = p_supplier_id,
      purchase_order = nullif(btrim(p_purchase_order), ''),
      document_type = p_document_type,
      document_number = btrim(p_document_number),
      notes = nullif(btrim(p_notes), '')
  WHERE id = p_purchase_entry_id;

  UPDATE public.stock_movements
  SET batch_id = batch_ref
  WHERE id IN (
    SELECT entry_item.stock_movement_id
    FROM public.purchase_entry_items entry_item
    WHERE entry_item.purchase_entry_id = p_purchase_entry_id
  );

  FOR current_item IN
    SELECT entry_item.*
    FROM public.purchase_entry_items entry_item
    WHERE entry_item.purchase_entry_id = p_purchase_entry_id
    ORDER BY entry_item.id
    FOR UPDATE
  LOOP
    IF current_item.stock_movement_id IS NULL THEN
      RAISE EXCEPTION 'La compra contiene una línea sin movimiento de stock; no se puede editar con seguridad';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_items) AS line(value)
      WHERE nullif(line.value->>'id', '')::uuid = current_item.stock_movement_id
    ) THEN
      SELECT movement.* INTO current_movement
      FROM public.stock_movements movement
      WHERE movement.id = current_item.stock_movement_id
      FOR UPDATE;
      IF NOT FOUND OR current_movement.type <> 'entrada' THEN
        RAISE EXCEPTION 'No se puede modificar una línea de compra que no tiene una entrada de stock válida';
      END IF;
      SELECT product.stock INTO current_stock
      FROM public.products product
      WHERE product.id = current_movement.product_id
      FOR UPDATE;
      IF current_stock < current_movement.quantity THEN
        RAISE EXCEPTION 'No se puede quitar esta línea: parte del stock comprado ya fue utilizado';
      END IF;

      DELETE FROM public.purchase_entry_items
      WHERE id = current_item.id;
      DELETE FROM public.stock_movements
      WHERE id = current_item.stock_movement_id
        AND type = 'entrada';
    END IF;
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_product_id := nullif(item->>'product_id', '')::uuid;
    item_quantity := nullif(item->>'quantity', '')::numeric;
    movement_id := nullif(item->>'id', '')::uuid;
    IF v_product_id IS NULL OR item_quantity IS NULL OR item_quantity <= 0
       OR nullif(btrim(item->>'unit'), '') IS NULL
       OR coalesce((item->>'unit_price')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'Revisa el producto, cantidad, unidad y precio';
    END IF;

    IF movement_id IS NOT NULL THEN
      UPDATE public.stock_movements
      SET product_id = v_product_id,
          quantity_value = item_quantity,
          quantity = greatest(1, round(item_quantity)::integer),
          measure_unit = btrim(item->>'unit'),
          unit_cost = (item->>'unit_price')::numeric,
          supplier_id = p_supplier_id,
          purchase_order = nullif(btrim(p_purchase_order), ''),
          document_type = p_document_type,
          document_number = btrim(p_document_number),
          notes = nullif(btrim(p_notes), '')
      WHERE id = movement_id
        AND type = 'entrada'
        AND id IN (
          SELECT entry_item.stock_movement_id
          FROM public.purchase_entry_items entry_item
          WHERE entry_item.purchase_entry_id = p_purchase_entry_id
        );
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Una línea enviada no pertenece a esta compra';
      END IF;

      UPDATE public.purchase_entry_items
      SET product_id = v_product_id,
          quantity = item_quantity,
          unit = btrim(item->>'unit'),
          unit_price = (item->>'unit_price')::numeric
      WHERE purchase_entry_id = p_purchase_entry_id
        AND stock_movement_id = movement_id;
    ELSE
      INSERT INTO public.stock_movements (
        product_id, type, quantity, quantity_value, measure_unit, unit_cost,
        supplier_id, reference, notes, purchase_order, document_type,
        document_number, batch_id, created_by
      )
      VALUES (
        v_product_id, 'entrada', greatest(1, round(item_quantity)::integer),
        item_quantity, btrim(item->>'unit'), (item->>'unit_price')::numeric,
        p_supplier_id, null, nullif(btrim(p_notes), ''),
        nullif(btrim(p_purchase_order), ''), p_document_type,
        btrim(p_document_number), batch_ref, auth.uid()
      )
      RETURNING id INTO movement_id;

      INSERT INTO public.purchase_entry_items (
        purchase_entry_id, stock_movement_id, product_id, quantity, unit, unit_price
      )
      VALUES (
        p_purchase_entry_id, movement_id, v_product_id, item_quantity,
        btrim(item->>'unit'), (item->>'unit_price')::numeric
      );
    END IF;
    saved_ids := array_append(saved_ids, movement_id);
  END LOOP;

  RETURN QUERY
  SELECT movement.*
  FROM public.stock_movements movement
  WHERE movement.id = ANY(saved_ids)
  ORDER BY movement.created_at, movement.id;
END;
$$;

REVOKE ALL ON FUNCTION public.editar_entrada_compra(uuid, uuid, text, text, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_entrada_compra(uuid, uuid, text, text, text, text, jsonb)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
