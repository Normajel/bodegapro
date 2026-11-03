-- Require documented reasons for every NEW cancellation.
-- Existing historical cancellation records are preserved unchanged.
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION private.require_documented_cancellation()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF TG_TABLE_NAME = 'purchase_entries' THEN
    IF OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL THEN
      IF NEW.cancellation_reason IS NULL OR length(btrim(NEW.cancellation_reason)) < 10 THEN
        RAISE EXCEPTION 'Debes indicar un motivo de anulación de al menos 10 caracteres';
      END IF;
    ELSIF OLD.cancelled_at IS NOT NULL AND
      (NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason OR
       NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at OR
       NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by) THEN
      RAISE EXCEPTION 'El historial de anulación no puede modificarse';
    END IF;
  ELSIF TG_TABLE_NAME = 'purchase_orders' THEN
    IF OLD.status IS DISTINCT FROM 'anulada' AND NEW.status = 'anulada' THEN
      IF NEW.cancellation_reason IS NULL OR length(btrim(NEW.cancellation_reason)) < 10 THEN
        RAISE EXCEPTION 'Debes indicar un motivo de anulación de al menos 10 caracteres';
      END IF;
      NEW.cancellation_reason := btrim(NEW.cancellation_reason);
      NEW.cancelled_at := now();
      NEW.cancelled_by := auth.uid();
      IF NEW.cancelled_by IS NULL THEN
        RAISE EXCEPTION 'Se requiere un usuario autenticado para anular la orden';
      END IF;
    ELSIF OLD.status = 'anulada' AND
      (NEW.status IS DISTINCT FROM OLD.status OR
       NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason OR
       NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at OR
       NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by) THEN
      RAISE EXCEPTION 'El historial de anulación no puede modificarse';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS require_purchase_cancellation_reason ON public.purchase_entries;
CREATE TRIGGER require_purchase_cancellation_reason
BEFORE UPDATE ON public.purchase_entries FOR EACH ROW
EXECUTE FUNCTION private.require_documented_cancellation();
DROP TRIGGER IF EXISTS require_order_cancellation_reason ON public.purchase_orders;
CREATE TRIGGER require_order_cancellation_reason
BEFORE UPDATE ON public.purchase_orders FOR EACH ROW
EXECUTE FUNCTION private.require_documented_cancellation();

CREATE OR REPLACE FUNCTION private.require_movement_cancellation_reason()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'El historial de anulación no puede modificarse';
  END IF;
  IF NEW.cancellation_reason IS NULL OR length(btrim(NEW.cancellation_reason)) < 10 THEN
    RAISE EXCEPTION 'Debes indicar un motivo de anulación de al menos 10 caracteres';
  END IF;
  NEW.cancellation_reason := btrim(NEW.cancellation_reason);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS require_movement_cancellation_reason ON public.stock_movement_document_cancellations;
CREATE TRIGGER require_movement_cancellation_reason BEFORE INSERT OR UPDATE OR DELETE
ON public.stock_movement_document_cancellations FOR EACH ROW
EXECUTE FUNCTION private.require_movement_cancellation_reason();

CREATE OR REPLACE FUNCTION public.anular_compra(p_purchase_entry_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_purchase public.purchase_entries%rowtype;
  v_item record;
  v_reason text;
begin
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Debes indicar un motivo de anulación de al menos 10 caracteres' USING ERRCODE = '22023';
  END IF;

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Debes iniciar sesión para anular una compra';
  end if;

  if public.has_app_permission('purchases', 'delete') IS NOT TRUE then
    raise exception 'No tienes permiso para anular compras';
  end if;

  v_reason := nullif(trim(p_reason), '');

  select *
  into v_purchase
  from public.purchase_entries
  where id = p_purchase_entry_id
  for update;

  if not found then
    raise exception 'La compra indicada no existe';
  end if;

  if v_purchase.cancelled_at is not null then
    raise exception 'Esta compra ya fue anulada';
  end if;

  if not exists (
    select 1
    from public.purchase_entry_items
    where purchase_entry_id = p_purchase_entry_id
  ) then
    raise exception 'La compra no tiene productos asociados';
  end if;

  perform p.id
  from public.products as p
  where p.id in (
    select i.product_id
    from public.purchase_entry_items as i
    where i.purchase_entry_id = p_purchase_entry_id
    group by i.product_id
  )
  order by p.id
  for update;

  if exists (
    select 1
    from public.purchase_entry_items as i
    left join public.products as p on p.id = i.product_id
    where i.purchase_entry_id = p_purchase_entry_id
    group by i.product_id, p.id, p.stock
    having p.id is null or p.stock < sum(i.quantity)
  ) then
    raise exception 'No hay stock suficiente para anular esta compra. No se realizaron cambios.';
  end if;

  for v_item in
    select i.product_id, sum(i.quantity) as quantity
    from public.purchase_entry_items as i
    where i.purchase_entry_id = p_purchase_entry_id
    group by i.product_id
    order by i.product_id
  loop
    insert into public.stock_movements (
      product_id, type, quantity, supplier_id, customer_id,
      unit_type, reference, notes, created_by
    )
    values (
      v_item.product_id, 'salida', v_item.quantity,
      v_purchase.supplier_id, null, null,
      'Anulación de compra: ' || v_purchase.document_type
        || ' N° ' || v_purchase.document_number,
      coalesce(v_reason, 'Anulación de compra ID: ' || p_purchase_entry_id::text),
      v_user_id
    );
  end loop;

  update public.purchase_entries
  set cancelled_at = now(),
      cancelled_by = v_user_id,
      cancellation_reason = v_reason
  where id = p_purchase_entry_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.anular_entrada_documento(p_movement_ids uuid[], p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  first_movement public.stock_movements%ROWTYPE;
  expected_count integer;
  provided_count integer;
  cancellation_ref uuid := gen_random_uuid();
  movement_row public.stock_movements%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Debes indicar un motivo de anulación de al menos 10 caracteres' USING ERRCODE = '22023';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;
  IF public.has_app_permission('purchases', 'delete') IS NOT TRUE THEN
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
$function$
;

CREATE OR REPLACE FUNCTION public.anular_salida_documento(p_movement_ids uuid[], p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  first_movement public.stock_movements%ROWTYPE;
  expected_count integer;
  provided_count integer;
  cancellation_ref uuid := gen_random_uuid();
  movement_row public.stock_movements%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Debes indicar un motivo de anulación de al menos 10 caracteres' USING ERRCODE = '22023';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;
  IF public.has_app_permission('movements', 'delete') IS NOT TRUE THEN
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
$function$
;
CREATE OR REPLACE FUNCTION public.cancel_purchase_order(p_order_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE current_status text;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Debes indicar un motivo de anulación de al menos 10 caracteres' USING ERRCODE = '22023';
  END IF;

  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión'; END IF;
    SELECT status INTO current_status FROM public.purchase_orders WHERE id = p_order_id FOR UPDATE;
      IF current_status IS NULL THEN RAISE EXCEPTION 'Orden de compra no encontrada'; END IF;
        IF current_status <> 'pendiente' OR EXISTS (SELECT 1 FROM public.purchase_order_items WHERE purchase_order_id = p_order_id AND received_quantity > 0) THEN RAISE EXCEPTION 'Solo se pueden anular órdenes pendientes sin recepciones'; END IF;
          UPDATE public.purchase_orders SET status = 'anulada', cancellation_reason = btrim(p_reason), updated_at = now() WHERE id = p_order_id;
          END $function$
;
CREATE OR REPLACE FUNCTION public.cancel_purchase_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'Debes indicar un motivo de anulación de al menos 10 caracteres';
END $$;
REVOKE ALL ON FUNCTION public.cancel_purchase_order(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_purchase_order(uuid,text) TO authenticated;
