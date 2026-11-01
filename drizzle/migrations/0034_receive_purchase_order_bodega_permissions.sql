CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_order_id uuid,
  p_document_type text,
  p_document_number text,
  p_lines jsonb
) RETURNS SETOF public.stock_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
     OR NOT public.has_app_permission('purchases', 'view')
     OR NOT public.has_app_permission('movements', 'create')
     OR (role_name <> 'BODEGA' AND NOT public.has_app_permission('purchases', 'edit')) THEN
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
$$;

REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid, text, text, jsonb) TO authenticated;
