-- Fail closed: missing profile, missing JSON key, JSON null and absent MFA never grant a permission.
CREATE OR REPLACE FUNCTION public.has_app_permission(module_name text, action_name text DEFAULT 'view'::text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $permission$
 SELECT coalesce((
   SELECT CASE WHEN role.name IN ('ADMIN','ADMINPRO')
     THEN public.is_app_admin() AND (auth.jwt()->>'aal')='aal2'
     ELSE (role.permissions->module_name->action_name)='true'::jsonb END
   FROM public.profiles profile JOIN public.app_roles role ON role.id=profile.role_id
   WHERE profile.id=auth.uid()
 ),false);
$permission$;
REVOKE ALL ON FUNCTION public.has_app_permission(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_app_permission(text,text) TO authenticated,service_role;

-- Explicit business rules. Keep unrelated existing permissions and Bodega's ability to create exits.
UPDATE public.app_roles SET permissions=permissions || jsonb_build_object(
 'inventory',coalesce(permissions->'inventory','{}'::jsonb)||'{"view":true,"create":false,"edit":false,"delete":false}'::jsonb,
 'movements',coalesce(permissions->'movements','{}'::jsonb)||'{"view":true,"create":false,"edit":false,"delete":false}'::jsonb,
 'purchases',coalesce(permissions->'purchases','{}'::jsonb)||'{"view":true,"create":false,"edit":false,"delete":false,"approve":true,"receive":false}'::jsonb,
 'contacts',coalesce(permissions->'contacts','{}'::jsonb)||'{"view":true,"create":false,"edit":false,"delete":false}'::jsonb,
 'cubication',coalesce(permissions->'cubication','{}'::jsonb)||'{"view":true,"create":false,"edit":false,"delete":false}'::jsonb
),updated_at=now() WHERE name='GERENCIA';
UPDATE public.app_roles SET permissions=permissions || jsonb_build_object(
 'inventory',coalesce(permissions->'inventory','{}'::jsonb)||'{"view":true,"edit":false,"delete":false}'::jsonb,
 'movements',coalesce(permissions->'movements','{}'::jsonb)||'{"view":true,"create":true,"edit":false,"delete":false}'::jsonb,
 'purchases',coalesce(permissions->'purchases','{}'::jsonb)||'{"view":true,"create":false,"edit":false,"delete":false,"approve":false,"receive":true}'::jsonb,
 'contacts',coalesce(permissions->'contacts','{}'::jsonb)||'{"edit":false,"delete":false}'::jsonb
),updated_at=now() WHERE name='BODEGA';

CREATE OR REPLACE FUNCTION public.can_approve_purchase_orders()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $approval$
 SELECT EXISTS(
  SELECT 1 FROM public.profiles profile JOIN public.app_roles role ON role.id=profile.role_id
  WHERE profile.id=auth.uid()
    AND ((role.name='GERENCIA' AND public.has_app_permission('purchases','view'))
      OR (role.name IN ('ADMIN','ADMINPRO') AND public.has_app_permission('purchases','edit')))
 );
$approval$;
REVOKE ALL ON FUNCTION public.can_approve_purchase_orders() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_approve_purchase_orders() TO authenticated,service_role;

-- Authorized OC receiving uses its checked SECURITY DEFINER endpoint and bypasses this direct-write policy.
-- Bodega retains creating exits, but cannot forge incoming stock through direct API inserts.
DROP POLICY IF EXISTS "Direct entries require administrator" ON public.stock_movements;
CREATE POLICY "Direct entries require administrator" ON public.stock_movements AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (type='salida' OR (public.is_app_admin() AND public.has_app_permission('purchases','edit')));


-- Harden every existing permission guard, including privileged RPCs.
CREATE OR REPLACE FUNCTION private.begin_purchase_order_email(p_order_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE o public.purchase_orders%ROWTYPE; s public.suppliers%ROWTYPE; e public.purchase_order_email_events%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.has_app_permission('purchases','view'),false)
    OR NOT coalesce(public.has_app_permission('purchases','edit'),false) THEN
   RAISE EXCEPTION 'No tienes permiso para enviar órdenes de compra';
 END IF;
 SELECT * INTO o FROM public.purchase_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.approval_status<>'aprobada' OR o.status='anulada' THEN RAISE EXCEPTION 'La OC debe estar aprobada y vigente'; END IF;
 SELECT * INTO e FROM public.purchase_order_email_events WHERE id=p_request_id;
 IF FOUND THEN
   IF e.purchase_order_id<>o.id OR e.created_by<>auth.uid() THEN RAISE EXCEPTION 'Solicitud de envío inválida'; END IF;
   RETURN jsonb_build_object('event',to_jsonb(e),'existing',true);
 END IF;
 IF EXISTS(SELECT 1 FROM public.purchase_order_email_events WHERE purchase_order_id=o.id AND status IN ('processing','unknown')) THEN
   RAISE EXCEPTION 'Hay un envío en curso o por verificar. Revisa su historial antes de reenviar';
 END IF;
 SELECT * INTO STRICT s FROM public.suppliers WHERE id=o.supplier_id;
 IF nullif(btrim(s.email),'') IS NULL OR s.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'El proveedor necesita un correo válido'; END IF;
 IF EXISTS(SELECT 1 FROM public.purchase_order_items WHERE purchase_order_id=o.id AND item_type='producto') AND o.delivery_days IS NULL THEN
   RAISE EXCEPTION 'Configura el plazo de entrega de la OC antes de enviarla';
 END IF;
 INSERT INTO public.purchase_order_email_events(id,purchase_order_id,recipient,subject,created_by)
 VALUES(p_request_id,o.id,btrim(s.email),'Orden de compra '||o.order_number,auth.uid()) RETURNING * INTO e;
 RETURN jsonb_build_object('event',to_jsonb(e),'existing',false,'order',to_jsonb(o),'supplier',to_jsonb(s),
  'items',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM public.purchase_order_items i WHERE i.purchase_order_id=o.id),
  'company',(SELECT to_jsonb(c) FROM public.company_settings c LIMIT 1));
END $function$;

CREATE OR REPLACE FUNCTION public.anular_compra(p_purchase_entry_id uuid, p_reason text DEFAULT NULL::text)
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
$function$;

CREATE OR REPLACE FUNCTION public.anular_entrada_documento(p_movement_ids uuid[], p_reason text DEFAULT NULL::text)
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
$function$;

CREATE OR REPLACE FUNCTION public.anular_salida_documento(p_movement_ids uuid[], p_reason text DEFAULT NULL::text)
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
$function$;

CREATE OR REPLACE FUNCTION public.archive_product(p_product_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  product_stock numeric;
BEGIN
  IF public.has_app_permission('inventory', 'delete') IS NOT TRUE THEN
    RAISE EXCEPTION 'No tienes permiso para quitar productos del inventario';
  END IF;

  SELECT stock_quantity INTO product_stock
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;
  IF product_stock > 0 THEN
    RAISE EXCEPTION 'No se puede quitar un producto con stock disponible. Registra su salida primero.';
  END IF;

  UPDATE public.products
  SET active = false, updated_at = now()
  WHERE id = p_product_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.editar_entrada_compra(p_purchase_entry_id uuid, p_supplier_id uuid, p_purchase_order text, p_document_type text, p_document_number text, p_notes text, p_items jsonb)
 RETURNS SETOF stock_movements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  IF public.has_app_permission('purchases', 'edit') IS NOT TRUE THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.editar_entrada_documento(p_movement_ids uuid[], p_payload jsonb)
 RETURNS SETOF stock_movements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  IF public.has_app_permission('purchases', 'edit') IS NOT TRUE THEN
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
    SELECT count(DISTINCT provided_id)
    FROM unnest(p_movement_ids) AS ids(provided_id)
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
$function$;

CREATE OR REPLACE FUNCTION public.editar_salida_documento(p_movement_ids uuid[], p_payload jsonb)
 RETURNS SETOF stock_movements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  IF public.has_app_permission('movements', 'edit') IS NOT TRUE THEN
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
    SELECT count(DISTINCT provided_id)
    FROM unnest(p_movement_ids) AS ids(provided_id)
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
$function$;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_order_id uuid, p_document_type text, p_document_number text, p_lines jsonb)
 RETURNS SETOF stock_movements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  role_name text;
  order_row public.purchase_orders%ROWTYPE;
  item jsonb;
  line_row public.purchase_order_items%ROWTYPE;
  receive_quantity numeric;
  batch uuid := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;

  SELECT upper(btrim(role.name))
  INTO role_name
  FROM public.profiles AS profile
  JOIN public.app_roles AS role ON role.id = profile.role_id
  WHERE profile.id = auth.uid();

  IF role_name IS NULL
     OR role_name NOT IN ('BODEGA', 'ADMIN', 'ADMINPRO')
     OR public.has_app_permission('purchases', 'view') IS NOT TRUE
     OR public.has_app_permission('movements', 'create') IS NOT TRUE
     OR (role_name <> 'BODEGA' AND public.has_app_permission('purchases', 'edit') IS NOT TRUE) THEN
    RAISE EXCEPTION 'No tienes permiso para registrar recepciones de órdenes de compra';
  END IF;

  IF p_document_type NOT IN ('factura', 'guia_despacho') THEN
    RAISE EXCEPTION 'Selecciona factura o guía de despacho';
  END IF;
  IF nullif(btrim(p_document_number), '') IS NULL THEN
    RAISE EXCEPTION 'Ingresa el número de factura o guía';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Ingresa las cantidades recibidas';
  END IF;

  SELECT *
  INTO order_row
  FROM public.purchase_orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF order_row.id IS NULL OR order_row.status IN ('completa', 'anulada') THEN
    RAISE EXCEPTION 'La orden no está disponible para recepción';
  END IF;
  IF order_row.approval_status <> 'aprobada' THEN
    RAISE EXCEPTION 'La orden debe estar aprobada antes de registrar su recepción';
  END IF;

  PERFORM product.id
  FROM public.products AS product
  WHERE product.id IN (
    SELECT purchase_item.product_id
    FROM public.purchase_order_items AS purchase_item
    JOIN jsonb_array_elements(p_lines) AS requested(value)
      ON (requested.value->>'item_id')::uuid = purchase_item.id
    WHERE purchase_item.purchase_order_id = p_order_id
      AND purchase_item.item_type = 'producto'
  )
  ORDER BY product.id
  FOR UPDATE;

  FOR item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    SELECT *
    INTO line_row
    FROM public.purchase_order_items
    WHERE id = (item->>'item_id')::uuid
      AND purchase_order_id = p_order_id
    FOR UPDATE;
    IF line_row.id IS NULL OR line_row.item_type <> 'producto' OR line_row.product_id IS NULL THEN
      RAISE EXCEPTION 'Solo se pueden recepcionar productos de inventario';
    END IF;

    receive_quantity := coalesce((item->>'quantity')::numeric, 0);
    IF receive_quantity < 0 OR receive_quantity > line_row.quantity - line_row.received_quantity THEN
      RAISE EXCEPTION 'La cantidad recibida supera lo pendiente para el producto';
    END IF;

    IF receive_quantity > 0 THEN
      INSERT INTO public.stock_movements(
        product_id, type, quantity, quantity_value, measure_unit, unit_cost,
        supplier_id, purchase_order, purchase_order_id, purchase_order_item_id,
        document_type, document_number, batch_id, created_by
      ) VALUES (
        line_row.product_id, 'entrada',
        greatest(1, round(receive_quantity)::integer), receive_quantity,
        line_row.measure_unit, line_row.unit_cost, order_row.supplier_id,
        order_row.order_number, p_order_id, line_row.id,
        p_document_type, btrim(p_document_number), batch, auth.uid()
      );
      UPDATE public.purchase_order_items
      SET received_quantity = received_quantity + receive_quantity
      WHERE id = line_row.id;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM public.purchase_order_items
    WHERE purchase_order_id = p_order_id
      AND item_type = 'producto'
      AND received_quantity < quantity
  ) THEN
    UPDATE public.purchase_orders
    SET status = 'completa', updated_at = now()
    WHERE id = p_order_id;
  ELSE
    UPDATE public.purchase_orders
    SET status = 'parcial', updated_at = now()
    WHERE id = p_order_id;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.stock_movements
  WHERE batch_id = batch
  ORDER BY created_at, id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_entrada_compra(p_supplier_id uuid, p_purchase_order text, p_document_type text, p_document_number text, p_notes text, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_entry_id uuid;
  v_movement_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_unit text;
  v_unit_price numeric;
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Debes iniciar sesión para registrar una compra';
  end if;

  if public.has_app_permission('purchases', 'create') IS NOT TRUE then
    raise exception 'No tienes permiso para registrar entradas de compra';
  end if;

  if p_document_type not in ('factura', 'guia_despacho') then
    raise exception 'Selecciona Factura o Guía de despacho';
  end if;

  if coalesce(trim(p_document_number), '') = '' then
    raise exception 'El número del documento es obligatorio';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un producto';
  end if;

  insert into public.purchase_entries (
    supplier_id, purchase_order, document_type, document_number, notes, created_by
  )
  values (
    p_supplier_id, nullif(trim(p_purchase_order), ''), p_document_type,
    trim(p_document_number), nullif(trim(p_notes), ''), v_user_id
  )
  returning id into v_entry_id;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_unit := trim(coalesce(v_item->>'unit', ''));
    v_unit_price := (v_item->>'unit_price')::numeric;

    if v_quantity <= 0 or v_unit = '' or v_unit_price < 0 then
      raise exception 'Cantidad, unidad o precio inválido';
    end if;

    if not exists (
      select 1 from public.products p where p.id = v_product_id
    ) then
      raise exception 'Uno de los productos seleccionados no existe';
    end if;

    insert into public.stock_movements (
      product_id, type, quantity, supplier_id, customer_id,
      unit_type, reference, notes, created_by
    )
    values (
      v_product_id, 'entrada', v_quantity, p_supplier_id, null,
      null, null, nullif(trim(p_notes), ''), v_user_id
    )
    returning id into v_movement_id;

    insert into public.purchase_entry_items (
      purchase_entry_id, stock_movement_id, product_id, quantity, unit, unit_price
    )
    values (
      v_entry_id, v_movement_id, v_product_id, v_quantity, v_unit, v_unit_price
    );
  end loop;

  return v_entry_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_cubication_template(p_unit_code text, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF public.has_app_permission('movements', 'edit') IS NOT TRUE THEN
    RAISE EXCEPTION 'No tienes permiso para guardar cubicaciones';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'La lista de ítems no tiene un formato válido';
  END IF;

  INSERT INTO public.cubication_templates (unit_code, created_by)
  VALUES (p_unit_code, auth.uid())
  ON CONFLICT (unit_code) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_id;

  DELETE FROM public.cubication_template_items WHERE template_id = v_id;
  INSERT INTO public.cubication_template_items (template_id, product_id, quantity)
  SELECT v_id, (item->>'product_id')::uuid, (item->>'quantity')::numeric
  FROM jsonb_array_elements(p_items) AS item;

  RETURN v_id;
END;
$function$;
