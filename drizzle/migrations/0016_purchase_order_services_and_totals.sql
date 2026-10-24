ALTER TABLE public.purchase_orders
  ADD COLUMN order_date date NOT NULL DEFAULT current_date,
  ADD COLUMN payment_terms text NOT NULL DEFAULT 'contado'
    CHECK (payment_terms IN ('contado', 'credito_10_dias', 'credito_30_dias', 'credito_60_dias', 'credito_90_dias', 'otro')),
  ADD COLUMN payment_terms_other text,
  ADD COLUMN description text,
  ADD COLUMN net_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN vat_rate numeric NOT NULL DEFAULT 0.19 CHECK (vat_rate = 0.19),
  ADD COLUMN vat_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN total_amount numeric NOT NULL DEFAULT 0;

UPDATE public.purchase_orders
SET order_date = (created_at AT TIME ZONE 'America/Santiago')::date;

ALTER TABLE public.purchase_order_items
  ALTER COLUMN product_id DROP NOT NULL,
  ADD COLUMN item_type text NOT NULL DEFAULT 'producto'
    CHECK (item_type IN ('producto', 'servicio')),
  ADD COLUMN description text,
  ADD COLUMN line_total numeric GENERATED ALWAYS AS (round(quantity * unit_cost, 0)) STORED;

UPDATE public.purchase_order_items AS item
SET description = product.name
FROM public.products AS product
WHERE product.id = item.product_id;

ALTER TABLE public.purchase_order_items
  ALTER COLUMN description SET NOT NULL,
  ADD CONSTRAINT purchase_order_items_kind_description_check
    CHECK (
      (item_type = 'producto' AND product_id IS NOT NULL)
      OR (item_type = 'servicio' AND product_id IS NULL)
    );

DROP FUNCTION IF EXISTS public.save_purchase_order(uuid, text, jsonb, uuid, uuid);
DROP FUNCTION IF EXISTS public.save_purchase_order(uuid, text, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.recalculate_purchase_order_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_order_id uuid;
  old_order_id uuid;
  new_order_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_order_id := OLD.purchase_order_id; END IF;
  IF TG_OP <> 'DELETE' THEN new_order_id := NEW.purchase_order_id; END IF;

  FOREACH affected_order_id IN ARRAY ARRAY[old_order_id, new_order_id] LOOP
    IF affected_order_id IS NOT NULL THEN
      UPDATE public.purchase_orders AS purchase_order
      SET net_total = totals.net_total,
          vat_amount = round(totals.net_total * purchase_order.vat_rate, 0),
          total_amount = totals.net_total + round(totals.net_total * purchase_order.vat_rate, 0)
      FROM (
        SELECT coalesce(sum(item.line_total), 0) AS net_total
        FROM public.purchase_order_items AS item
        WHERE item.purchase_order_id = affected_order_id
      ) AS totals
      WHERE purchase_order.id = affected_order_id;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_purchase_order_totals() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER recalculate_purchase_order_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_purchase_order_totals();

UPDATE public.purchase_orders AS purchase_order
SET net_total = totals.net_total,
    vat_amount = round(totals.net_total * purchase_order.vat_rate, 0),
    total_amount = totals.net_total + round(totals.net_total * purchase_order.vat_rate, 0)
FROM (
  SELECT purchase_order_id, coalesce(sum(line_total), 0) AS net_total
  FROM public.purchase_order_items
  GROUP BY purchase_order_id
) AS totals
WHERE purchase_order.id = totals.purchase_order_id;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_payment_terms_other_check
    CHECK (
      (payment_terms = 'otro' AND nullif(btrim(payment_terms_other), '') IS NOT NULL)
      OR (payment_terms <> 'otro' AND payment_terms_other IS NULL)
    ),
  ADD CONSTRAINT purchase_orders_totals_check
    CHECK (
      net_total >= 0
      AND vat_amount = round(net_total * vat_rate, 0)
      AND total_amount = net_total + vat_amount
    );

CREATE OR REPLACE FUNCTION public.save_purchase_order(
  p_supplier_id uuid,
  p_notes text,
  p_lines jsonb,
  p_order_id uuid DEFAULT NULL,
  p_cost_center_id uuid DEFAULT NULL,
  p_order_date date DEFAULT current_date,
  p_payment_terms text DEFAULT 'contado',
  p_payment_terms_other text DEFAULT NULL,
  p_description text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  order_id uuid;
  order_number text;
  item jsonb;
  item_type text;
  item_description text;
  item_product_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión'; END IF;
  IF p_supplier_id IS NULL THEN RAISE EXCEPTION 'Selecciona un proveedor'; END IF;
  IF p_order_date IS NULL THEN RAISE EXCEPTION 'Selecciona la fecha de la orden'; END IF;
  IF p_payment_terms NOT IN (
    'contado', 'credito_10_dias', 'credito_30_dias',
    'credito_60_dias', 'credito_90_dias', 'otro'
  ) THEN
    RAISE EXCEPTION 'Selecciona una condición de pago válida';
  END IF;
  IF p_payment_terms = 'otro' AND nullif(btrim(p_payment_terms_other), '') IS NULL THEN
    RAISE EXCEPTION 'Especifica la condición de pago personalizada';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Agrega al menos un producto o servicio a la orden';
  END IF;
  IF p_cost_center_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.purchase_cost_centers WHERE id = p_cost_center_id
  ) THEN
    RAISE EXCEPTION 'Selecciona un centro de costo válido';
  END IF;

  IF p_order_id IS NOT NULL THEN
    SELECT id, purchase_orders.order_number INTO order_id, order_number
    FROM public.purchase_orders
    WHERE id = p_order_id AND status = 'pendiente'
    FOR UPDATE;
    IF order_id IS NULL THEN
      RAISE EXCEPTION 'Solo se pueden modificar órdenes pendientes sin recepciones';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.purchase_order_items
      WHERE purchase_order_id = order_id AND received_quantity > 0
    ) THEN
      RAISE EXCEPTION 'No se puede modificar una orden que ya tiene recepciones';
    END IF;
    UPDATE public.purchase_orders
    SET supplier_id = p_supplier_id,
        cost_center_id = p_cost_center_id,
        order_date = p_order_date,
        payment_terms = p_payment_terms,
        payment_terms_other = CASE
          WHEN p_payment_terms = 'otro' THEN nullif(btrim(p_payment_terms_other), '')
          ELSE NULL
        END,
        description = nullif(btrim(p_description), ''),
        notes = nullif(btrim(p_notes), ''),
        approval_status = 'por_aprobar',
        approved_by = NULL,
        approved_at = NULL,
        updated_at = now()
    WHERE id = order_id;
    DELETE FROM public.purchase_order_items WHERE purchase_order_id = order_id;
  ELSE
    order_number := 'OC-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.purchase_order_number_seq')::text, 6, '0');
    INSERT INTO public.purchase_orders(
      order_number, supplier_id, cost_center_id, order_date, payment_terms,
      payment_terms_other, description, notes, created_by
    )
    VALUES (
      order_number,
      p_supplier_id,
      p_cost_center_id,
      p_order_date,
      p_payment_terms,
      CASE WHEN p_payment_terms = 'otro' THEN nullif(btrim(p_payment_terms_other), '') ELSE NULL END,
      nullif(btrim(p_description), ''),
      nullif(btrim(p_notes), ''),
      auth.uid()
    )
    RETURNING id INTO order_id;
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    item_type := coalesce(item->>'item_type', 'producto');
    item_description := nullif(btrim(item->>'description'), '');
    item_product_id := nullif(item->>'product_id', '')::uuid;

    IF coalesce((item->>'quantity')::numeric, 0) <= 0
       OR coalesce((item->>'unit_cost')::numeric, -1) < 0
       OR nullif(btrim(item->>'measure_unit'), '') IS NULL THEN
      RAISE EXCEPTION 'Revisa cantidades, unidades y precios netos de la orden';
    END IF;
    IF item_type NOT IN ('producto', 'servicio') THEN
      RAISE EXCEPTION 'Selecciona un tipo de línea válido';
    END IF;
    IF item_type = 'producto' AND item_product_id IS NULL THEN
      RAISE EXCEPTION 'Selecciona un producto para cada línea de producto';
    END IF;
    IF item_type = 'servicio' AND item_product_id IS NOT NULL THEN
      RAISE EXCEPTION 'Las líneas de servicio no pueden asociarse a productos de inventario';
    END IF;
    IF item_type = 'producto' AND item_description IS NULL THEN
      SELECT name INTO item_description FROM public.products WHERE id = item_product_id;
    END IF;
    IF item_description IS NULL THEN
      RAISE EXCEPTION 'Agrega una descripción para cada producto o servicio';
    END IF;

    INSERT INTO public.purchase_order_items(
      purchase_order_id, item_type, description, product_id,
      quantity, measure_unit, unit_cost
    )
    VALUES (
      order_id, item_type, item_description, item_product_id,
      (item->>'quantity')::numeric, btrim(item->>'measure_unit'), (item->>'unit_cost')::numeric
    );
  END LOOP;

  RETURN order_id;
END $$;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_order_id uuid,
  p_document_type text,
  p_document_number text,
  p_lines jsonb
) RETURNS SETOF public.stock_movements
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  order_row public.purchase_orders%ROWTYPE;
  item jsonb;
  line_row public.purchase_order_items%ROWTYPE;
  receive_quantity numeric;
  batch uuid := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión'; END IF;
  IF p_document_type NOT IN ('factura', 'guia_despacho') THEN
    RAISE EXCEPTION 'Selecciona factura o guía de despacho';
  END IF;
  IF nullif(btrim(p_document_number), '') IS NULL THEN
    RAISE EXCEPTION 'Ingresa el número de factura o guía';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Ingresa las cantidades recibidas';
  END IF;

  SELECT * INTO order_row
  FROM public.purchase_orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF order_row.id IS NULL OR order_row.status IN ('completa', 'anulada') THEN
    RAISE EXCEPTION 'La orden no está disponible para recepción';
  END IF;
  IF order_row.approval_status <> 'aprobada' THEN
    RAISE EXCEPTION 'La orden debe estar aprobada antes de registrar su recepción';
  END IF;

  PERFORM product.id FROM public.products AS product
  WHERE product.id IN (
    SELECT purchase_item.product_id
    FROM public.purchase_order_items AS purchase_item
    JOIN jsonb_array_elements(p_lines) AS requested(value)
      ON (requested.value->>'item_id')::uuid = purchase_item.id
    WHERE purchase_item.purchase_order_id = p_order_id
      AND purchase_item.item_type = 'producto'
  )
  ORDER BY product.id FOR UPDATE;

  FOR item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO line_row
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
    SELECT 1 FROM public.purchase_order_items
    WHERE purchase_order_id = p_order_id
      AND item_type = 'producto'
      AND received_quantity < quantity
  ) THEN
    UPDATE public.purchase_orders SET status = 'completa', updated_at = now()
    WHERE id = p_order_id;
  ELSE
    UPDATE public.purchase_orders SET status = 'parcial', updated_at = now()
    WHERE id = p_order_id;
  END IF;

  RETURN QUERY SELECT * FROM public.stock_movements
  WHERE batch_id = batch ORDER BY created_at, id;
END $$;

REVOKE ALL ON FUNCTION public.save_purchase_order(uuid, text, jsonb, uuid, uuid, date, text, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_purchase_order(uuid, text, jsonb, uuid, uuid, date, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid, text, text, jsonb) TO authenticated;
