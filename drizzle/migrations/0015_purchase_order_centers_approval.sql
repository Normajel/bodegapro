CREATE TABLE public.purchase_cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX purchase_cost_centers_name_idx
  ON public.purchase_cost_centers (lower(btrim(name)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_cost_centers TO authenticated;
GRANT ALL ON public.purchase_cost_centers TO service_role;
ALTER TABLE public.purchase_cost_centers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read purchase cost centers" ON public.purchase_cost_centers
  FOR SELECT TO authenticated
  USING (public.has_app_permission('purchases', 'view'));
CREATE POLICY "Create purchase cost centers" ON public.purchase_cost_centers
  FOR INSERT TO authenticated
  WITH CHECK (public.has_app_permission('purchases', 'edit'));
CREATE POLICY "Update purchase cost centers" ON public.purchase_cost_centers
  FOR UPDATE TO authenticated
  USING (public.has_app_permission('purchases', 'edit'))
  WITH CHECK (public.has_app_permission('purchases', 'edit'));
CREATE POLICY "Delete purchase cost centers" ON public.purchase_cost_centers
  FOR DELETE TO authenticated
  USING (public.has_app_permission('purchases', 'edit'));

ALTER TABLE public.purchase_orders
  ADD COLUMN cost_center_id uuid REFERENCES public.purchase_cost_centers(id) ON DELETE RESTRICT,
  ADD COLUMN approval_status text NOT NULL DEFAULT 'por_aprobar'
    CHECK (approval_status IN ('por_aprobar', 'aprobada')),
  ADD COLUMN approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN approved_at timestamptz;

UPDATE public.purchase_orders
SET approval_status = 'aprobada',
    approved_at = created_at;

CREATE OR REPLACE FUNCTION public.require_approved_purchase_order_receipt()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.purchase_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.purchase_orders
    WHERE id = NEW.purchase_order_id AND approval_status = 'aprobada'
  ) THEN
    RAISE EXCEPTION 'La orden de compra debe estar aprobada antes de registrar su recepción';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER stock_movement_requires_approved_purchase_order
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.require_approved_purchase_order_receipt();

DROP FUNCTION public.save_purchase_order(uuid, text, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.save_purchase_order(
  p_supplier_id uuid,
  p_notes text,
  p_lines jsonb,
  p_order_id uuid DEFAULT NULL,
  p_cost_center_id uuid DEFAULT NULL
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
      order_number, supplier_id, cost_center_id, notes, created_by
    )
    VALUES (
      order_number, p_supplier_id, p_cost_center_id, nullif(btrim(p_notes), ''), auth.uid()
    )
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

CREATE OR REPLACE FUNCTION public.approve_purchase_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  order_row public.purchase_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión'; END IF;
  IF NOT public.has_app_permission('purchases', 'edit') THEN
    RAISE EXCEPTION 'No tienes permiso para aprobar órdenes de compra';
  END IF;

  SELECT * INTO order_row
  FROM public.purchase_orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF order_row.id IS NULL THEN RAISE EXCEPTION 'Orden de compra no encontrada'; END IF;
  IF order_row.status <> 'pendiente' THEN
    RAISE EXCEPTION 'Solo se pueden aprobar órdenes pendientes';
  END IF;
  IF order_row.approval_status <> 'por_aprobar' THEN
    RAISE EXCEPTION 'La orden ya fue aprobada';
  END IF;

  UPDATE public.purchase_orders
  SET approval_status = 'aprobada',
      approved_by = auth.uid(),
      approved_at = now(),
      updated_at = now()
  WHERE id = p_order_id;
END $$;

REVOKE ALL ON FUNCTION public.save_purchase_order(uuid, text, jsonb, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_purchase_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_purchase_order(uuid, text, jsonb, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_purchase_order(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.require_approved_purchase_order_receipt() FROM PUBLIC, anon, authenticated;
