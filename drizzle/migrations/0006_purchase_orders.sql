CREATE SEQUENCE public.purchase_order_number_seq;
GRANT USAGE ON SEQUENCE public.purchase_order_number_seq TO authenticated, service_role;

CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'parcial', 'completa', 'anulada')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  received_quantity numeric NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  measure_unit text NOT NULL,
  unit_cost numeric NOT NULL CHECK (unit_cost >= 0),
  CHECK (received_quantity <= quantity)
);

ALTER TABLE public.stock_movements
  ADD COLUMN purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  ADD COLUMN purchase_order_item_id uuid REFERENCES public.purchase_order_items(id) ON DELETE SET NULL;

CREATE INDEX purchase_orders_created_at_idx ON public.purchase_orders(created_at DESC);
CREATE INDEX purchase_order_items_order_idx ON public.purchase_order_items(purchase_order_id);
CREATE INDEX stock_movements_purchase_order_idx ON public.stock_movements(purchase_order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders, public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_orders, public.purchase_order_items TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team full access purchase orders" ON public.purchase_orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Team full access purchase order items" ON public.purchase_order_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.save_purchase_order(
  p_supplier_id uuid,
  p_notes text,
  p_lines jsonb,
  p_order_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  order_id uuid;
  order_number text;
  item jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión'; END IF;
  IF p_supplier_id IS NULL THEN RAISE EXCEPTION 'Selecciona un proveedor'; END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Agrega al menos un producto a la orden';
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
    SET supplier_id = p_supplier_id, notes = nullif(btrim(p_notes), ''), updated_at = now()
    WHERE id = order_id;
    DELETE FROM public.purchase_order_items WHERE purchase_order_id = order_id;
  ELSE
    order_number := 'OC-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.purchase_order_number_seq')::text, 6, '0');
    INSERT INTO public.purchase_orders(order_number, supplier_id, notes, created_by)
    VALUES (order_number, p_supplier_id, nullif(btrim(p_notes), ''), auth.uid())
    RETURNING id INTO order_id;
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF coalesce((item->>'quantity')::numeric, 0) <= 0
       OR coalesce((item->>'unit_cost')::numeric, -1) < 0
       OR nullif(btrim(item->>'measure_unit'), '') IS NULL THEN
      RAISE EXCEPTION 'Revisa cantidades, unidades y costos de la orden';
    END IF;
    INSERT INTO public.purchase_order_items(
      purchase_order_id, product_id, quantity, measure_unit, unit_cost
    )
    VALUES (
      order_id,
      (item->>'product_id')::uuid,
      (item->>'quantity')::numeric,
      btrim(item->>'measure_unit'),
      (item->>'unit_cost')::numeric
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

  PERFORM id FROM public.products
  WHERE id IN (
    SELECT poi.product_id
    FROM public.purchase_order_items poi
    JOIN jsonb_array_elements(p_lines) AS requested(value)
      ON (requested.value->>'item_id')::uuid = poi.id
    WHERE poi.purchase_order_id = p_order_id
  )
  ORDER BY id FOR UPDATE;

  FOR item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO line_row
    FROM public.purchase_order_items
    WHERE id = (item->>'item_id')::uuid
      AND purchase_order_id = p_order_id
    FOR UPDATE;
    IF line_row.id IS NULL THEN RAISE EXCEPTION 'Producto de orden inválido'; END IF;
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
    WHERE purchase_order_id = p_order_id AND received_quantity < quantity
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

CREATE OR REPLACE FUNCTION public.cancel_purchase_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE current_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión'; END IF;
  SELECT status INTO current_status FROM public.purchase_orders
  WHERE id = p_order_id FOR UPDATE;
  IF current_status IS NULL THEN RAISE EXCEPTION 'Orden de compra no encontrada'; END IF;
  IF current_status <> 'pendiente' OR EXISTS (
    SELECT 1 FROM public.purchase_order_items
    WHERE purchase_order_id = p_order_id AND received_quantity > 0
  ) THEN
    RAISE EXCEPTION 'Solo se pueden anular órdenes pendientes sin recepciones';
  END IF;
  UPDATE public.purchase_orders SET status = 'anulada', updated_at = now()
  WHERE id = p_order_id;
END $$;

REVOKE ALL ON FUNCTION public.save_purchase_order(uuid, text, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_purchase_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_purchase_order(uuid, text, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_purchase_order(uuid) TO authenticated;
