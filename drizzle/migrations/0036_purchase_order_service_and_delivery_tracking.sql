ALTER TABLE public.suppliers
  ADD COLUMN supplier_type text NOT NULL DEFAULT 'ambos'
    CHECK (supplier_type IN ('producto', 'servicio', 'ambos')),
  ADD COLUMN delivery_lead_time_days integer
    CHECK (delivery_lead_time_days IS NULL OR delivery_lead_time_days >= 0);

ALTER TABLE public.purchase_orders
  ADD COLUMN delivery_lead_time_override_days integer
    CHECK (delivery_lead_time_override_days IS NULL OR delivery_lead_time_override_days >= 0),
  ADD COLUMN delivery_lead_time_days integer
    CHECK (delivery_lead_time_days IS NULL OR delivery_lead_time_days >= 0),
  ADD COLUMN delivery_due_date date,
  ADD COLUMN first_sent_at timestamptz,
  ADD COLUMN completed_at timestamptz;

ALTER TABLE public.purchase_order_items
  ADD COLUMN service_executed_at timestamptz,
  ADD COLUMN service_executed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT purchase_order_service_execution_check
    CHECK (
      (item_type = 'servicio' AND (service_executed_at IS NULL) = (service_executed_by IS NULL))
      OR (item_type = 'producto' AND service_executed_at IS NULL AND service_executed_by IS NULL)
    );

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_status_check,
  ADD CONSTRAINT purchase_orders_status_check
    CHECK (status IN ('pendiente', 'parcial', 'completa', 'anulada', 'cerrada_con_diferencia'));

CREATE TABLE public.purchase_order_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id()
    REFERENCES public.companies(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  recipient_email text NOT NULL CHECK (btrim(recipient_email) <> ''),
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  provider_message_id text,
  error_message text,
  pdf_storage_path text,
  idempotency_key text,
  delivery_lead_time_days integer
    CHECK (delivery_lead_time_days IS NULL OR delivery_lead_time_days >= 0),
  delivery_due_date date,
  CONSTRAINT purchase_order_dispatch_sent_check
    CHECK ((status = 'sent') = (sent_at IS NOT NULL)),
  CONSTRAINT purchase_order_dispatch_idempotency_unique
    UNIQUE (company_id, idempotency_key)
);

CREATE INDEX purchase_order_dispatch_order_idx
  ON public.purchase_order_dispatches (company_id, purchase_order_id, created_at DESC);

CREATE TABLE public.purchase_order_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id()
    REFERENCES public.companies(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL UNIQUE
    REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  closed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  closed_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (btrim(reason) <> '')
);

CREATE TABLE public.purchase_order_closure_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id()
    REFERENCES public.companies(id) ON DELETE CASCADE,
  closure_id uuid NOT NULL
    REFERENCES public.purchase_order_closures(id) ON DELETE RESTRICT,
  purchase_order_item_id uuid NOT NULL
    REFERENCES public.purchase_order_items(id) ON DELETE RESTRICT,
  ordered_quantity numeric NOT NULL CHECK (ordered_quantity > 0),
  received_quantity numeric NOT NULL CHECK (received_quantity >= 0),
  waived_quantity numeric NOT NULL CHECK (waived_quantity > 0),
  UNIQUE (closure_id, purchase_order_item_id),
  CHECK (received_quantity + waived_quantity = ordered_quantity)
);

CREATE TABLE public.purchase_order_delivery_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id()
    REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL
    REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  alert_type text NOT NULL
    CHECK (alert_type IN ('dos_dias', 'fecha_compromiso', 'vencida')),
  delivery_due_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  resolved_at timestamptz,
  UNIQUE (company_id, user_id, purchase_order_id, alert_type, delivery_due_date)
);

CREATE INDEX purchase_order_delivery_notifications_user_idx
  ON public.purchase_order_delivery_notifications (company_id, user_id, resolved_at, created_at DESC);

ALTER TABLE public.purchase_order_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_closure_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_delivery_notifications ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.purchase_order_dispatches, public.purchase_order_closures,
  public.purchase_order_closure_items, public.purchase_order_delivery_notifications
  TO authenticated;
GRANT UPDATE (read_at)
  ON public.purchase_order_delivery_notifications TO authenticated;
GRANT ALL ON public.purchase_order_dispatches, public.purchase_order_closures,
  public.purchase_order_closure_items, public.purchase_order_delivery_notifications
  TO service_role;

CREATE POLICY "Read purchase order dispatches"
  ON public.purchase_order_dispatches FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.has_app_permission('purchases', 'view')
  );
CREATE POLICY "Read purchase order closures"
  ON public.purchase_order_closures FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.has_app_permission('purchases', 'view')
  );
CREATE POLICY "Read purchase order closure items"
  ON public.purchase_order_closure_items FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.has_app_permission('purchases', 'view')
  );
CREATE POLICY "Read own purchase order delivery notifications"
  ON public.purchase_order_delivery_notifications FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id()
    AND user_id = auth.uid()
    AND public.has_app_permission('purchases', 'view')
  );
CREATE POLICY "Create own purchase order delivery notifications"
  ON public.purchase_order_delivery_notifications FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.current_company_id()
    AND user_id = auth.uid()
    AND public.has_app_permission('purchases', 'view')
  );
CREATE POLICY "Mark own purchase order delivery notifications read"
  ON public.purchase_order_delivery_notifications FOR UPDATE TO authenticated
  USING (
    company_id = public.current_company_id()
    AND user_id = auth.uid()
    AND public.has_app_permission('purchases', 'view')
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND user_id = auth.uid()
    AND public.has_app_permission('purchases', 'view')
  );

CREATE OR REPLACE VIEW public.purchase_order_services
WITH (security_invoker = true)
AS
SELECT
  item.id,
  item.company_id,
  item.purchase_order_id,
  order_row.order_number,
  order_row.supplier_id,
  supplier.name AS supplier_name,
  order_row.created_at,
  order_row.approved_at,
  order_row.payment_terms,
  order_row.payment_terms_other,
  item.description,
  item.quantity,
  item.measure_unit,
  item.unit_cost,
  item.line_total,
  CASE
    WHEN order_row.status = 'anulada' THEN 'anulado'
    WHEN order_row.approval_status = 'aprobada' AND item.service_executed_at IS NOT NULL THEN 'ejecutado'
    WHEN order_row.approval_status = 'aprobada' THEN 'aceptado'
    ELSE 'por_aprobar'
  END AS service_status,
  item.service_executed_at,
  item.service_executed_by
FROM public.purchase_order_items AS item
JOIN public.purchase_orders AS order_row
  ON order_row.id = item.purchase_order_id
 AND order_row.company_id = item.company_id
JOIN public.suppliers AS supplier
  ON supplier.id = order_row.supplier_id
 AND supplier.company_id = order_row.company_id
WHERE item.item_type = 'servicio';

GRANT SELECT ON public.purchase_order_services TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_purchase_order_service_executed(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  updated_item_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;
  IF NOT public.has_app_permission('purchases', 'edit') THEN
    RAISE EXCEPTION 'No tienes permiso para registrar la ejecución del servicio';
  END IF;

  UPDATE public.purchase_order_items AS item
  SET service_executed_at = now(),
      service_executed_by = auth.uid()
  FROM public.purchase_orders AS order_row
  WHERE item.id = p_item_id
    AND item.company_id = public.current_company_id()
    AND item.item_type = 'servicio'
    AND item.service_executed_at IS NULL
    AND order_row.id = item.purchase_order_id
    AND order_row.company_id = item.company_id
    AND order_row.approval_status = 'aprobada'
    AND order_row.status NOT IN ('anulada', 'cerrada_con_diferencia')
  RETURNING item.id INTO updated_item_id;

  IF updated_item_id IS NULL THEN
    RAISE EXCEPTION 'El servicio no está disponible para marcarlo como ejecutado';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_purchase_order_service_executed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_purchase_order_service_executed(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_purchase_order_item_supplier_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  supplier_type text;
BEGIN
  SELECT supplier.supplier_type
  INTO supplier_type
  FROM public.purchase_orders AS order_row
  JOIN public.suppliers AS supplier
    ON supplier.id = order_row.supplier_id
   AND supplier.company_id = order_row.company_id
  WHERE order_row.id = NEW.purchase_order_id
    AND order_row.company_id = public.current_company_id();

  IF supplier_type IS NULL THEN
    RAISE EXCEPTION 'No se encontró el proveedor de esta orden en la empresa activa';
  END IF;
  IF NEW.item_type = 'producto' AND supplier_type = 'servicio' THEN
    RAISE EXCEPTION 'El proveedor está clasificado solo para servicios';
  END IF;
  IF NEW.item_type = 'servicio' AND supplier_type = 'producto' THEN
    RAISE EXCEPTION 'El proveedor está clasificado solo para productos';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER purchase_order_items_validate_supplier_type
  BEFORE INSERT OR UPDATE OF item_type, purchase_order_id, product_id
  ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_purchase_order_item_supplier_type();

REVOKE ALL ON FUNCTION public.validate_purchase_order_item_supplier_type()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_delivery_override_after_send()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.first_sent_at IS NOT NULL
     AND NEW.delivery_lead_time_override_days IS DISTINCT FROM OLD.delivery_lead_time_override_days THEN
    RAISE EXCEPTION 'No se puede cambiar el plazo después del primer envío';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER purchase_orders_prevent_delivery_override_after_send
  BEFORE UPDATE OF delivery_lead_time_override_days ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delivery_override_after_send();

REVOKE ALL ON FUNCTION public.prevent_delivery_override_after_send()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_direct_delivery_commitment_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role')
     AND (
       NEW.first_sent_at IS DISTINCT FROM OLD.first_sent_at
       OR NEW.delivery_lead_time_days IS DISTINCT FROM OLD.delivery_lead_time_days
       OR NEW.delivery_due_date IS DISTINCT FROM OLD.delivery_due_date
     ) THEN
    RAISE EXCEPTION 'Las fechas y el plazo comprometidos solo se registran al confirmar el envío';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER purchase_orders_prevent_direct_delivery_commitment_changes
  BEFORE UPDATE OF first_sent_at, delivery_lead_time_days, delivery_due_date
  ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.prevent_direct_delivery_commitment_changes();

REVOKE ALL ON FUNCTION public.prevent_direct_delivery_commitment_changes()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_purchase_order_dispatch_success()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  order_row public.purchase_orders%ROWTYPE;
  supplier_lead_time integer;
  effective_lead_time integer;
  sent_date date;
BEGIN
  IF NEW.status <> 'sent'
     OR (TG_OP = 'UPDATE' AND OLD.status = 'sent') THEN
    RETURN NEW;
  END IF;

  SELECT purchase_order.*
  INTO order_row
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.id = NEW.purchase_order_id
    AND purchase_order.company_id = NEW.company_id
  FOR UPDATE;
  IF order_row.id IS NULL
     OR order_row.approval_status <> 'aprobada'
     OR order_row.status IN ('anulada', 'completa', 'cerrada_con_diferencia') THEN
    RAISE EXCEPTION 'Solo se pueden enviar órdenes aprobadas con recepción pendiente';
  END IF;

  SELECT supplier.delivery_lead_time_days
  INTO supplier_lead_time
  FROM public.suppliers AS supplier
  WHERE supplier.id = order_row.supplier_id
    AND supplier.company_id = order_row.company_id;

  NEW.sent_at := coalesce(NEW.sent_at, now());
  IF order_row.first_sent_at IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.purchase_order_items AS item
      WHERE item.purchase_order_id = order_row.id
        AND item.company_id = order_row.company_id
        AND item.item_type = 'producto'
    ) THEN
      effective_lead_time := coalesce(
        NEW.delivery_lead_time_days,
        order_row.delivery_lead_time_override_days,
        supplier_lead_time
      );
    ELSE
      effective_lead_time := NULL;
    END IF;
    NEW.delivery_lead_time_days := effective_lead_time;
    sent_date := (NEW.sent_at AT TIME ZONE 'America/Santiago')::date;
    NEW.delivery_due_date := CASE
      WHEN effective_lead_time IS NULL THEN NULL
      ELSE sent_date + effective_lead_time
    END;

    UPDATE public.purchase_orders
    SET first_sent_at = NEW.sent_at,
        delivery_lead_time_days = effective_lead_time,
        delivery_due_date = NEW.delivery_due_date,
        updated_at = now()
    WHERE id = NEW.purchase_order_id
      AND company_id = NEW.company_id;
  ELSE
    NEW.delivery_lead_time_days := order_row.delivery_lead_time_days;
    NEW.delivery_due_date := order_row.delivery_due_date;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER purchase_order_dispatch_success
  BEFORE INSERT OR UPDATE OF status ON public.purchase_order_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.apply_purchase_order_dispatch_success();

REVOKE ALL ON FUNCTION public.apply_purchase_order_dispatch_success()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.close_purchase_order_with_difference(
  p_order_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  order_row public.purchase_orders%ROWTYPE;
  closure_id uuid;
  caller_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;
  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Indica el motivo del cierre con diferencias';
  END IF;

  SELECT upper(btrim(role.name))
  INTO caller_role
  FROM public.profiles AS profile
  JOIN public.company_memberships AS membership
    ON membership.user_id = profile.id
   AND membership.company_id = public.current_company_id()
   AND membership.is_active
  JOIN public.app_roles AS role ON role.id = membership.role_id
  WHERE profile.id = auth.uid();

  IF caller_role IS NULL
     OR caller_role NOT IN ('ADMIN', 'ADMINPRO', 'GERENCIA')
     OR (caller_role IN ('ADMIN', 'ADMINPRO') AND NOT public.has_app_permission('purchases', 'edit')) THEN
    RAISE EXCEPTION 'Solo un administrador o gerencia puede cerrar una orden con diferencias';
  END IF;

  SELECT *
  INTO order_row
  FROM public.purchase_orders
  WHERE id = p_order_id
    AND company_id = public.current_company_id()
  FOR UPDATE;

  IF order_row.id IS NULL
     OR order_row.status NOT IN ('pendiente', 'parcial')
     OR order_row.approval_status <> 'aprobada' THEN
    RAISE EXCEPTION 'La orden no está disponible para cierre con diferencias';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.purchase_order_items AS item
    WHERE item.purchase_order_id = p_order_id
      AND item.company_id = order_row.company_id
      AND item.item_type = 'producto'
      AND item.received_quantity < item.quantity
  ) THEN
    RAISE EXCEPTION 'La orden no tiene cantidades pendientes para cerrar';
  END IF;

  INSERT INTO public.purchase_order_closures(
    company_id, purchase_order_id, closed_by, reason
  )
  VALUES (
    order_row.company_id, p_order_id, auth.uid(), btrim(p_reason)
  )
  RETURNING id INTO closure_id;

  INSERT INTO public.purchase_order_closure_items(
    company_id, closure_id, purchase_order_item_id,
    ordered_quantity, received_quantity, waived_quantity
  )
  SELECT
    item.company_id,
    closure_id,
    item.id,
    item.quantity,
    item.received_quantity,
    item.quantity - item.received_quantity
  FROM public.purchase_order_items AS item
  WHERE item.purchase_order_id = p_order_id
    AND item.company_id = order_row.company_id
    AND item.item_type = 'producto'
    AND item.received_quantity < item.quantity;

  UPDATE public.purchase_orders
  SET status = 'cerrada_con_diferencia',
      updated_at = now()
  WHERE id = p_order_id
    AND company_id = order_row.company_id;

  RETURN closure_id;
END;
$$;

REVOKE ALL ON FUNCTION public.close_purchase_order_with_difference(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_purchase_order_with_difference(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_purchase_order_delivery_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  active_company_id uuid := public.current_company_id();
  local_today date := (now() AT TIME ZONE 'America/Santiago')::date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;
  IF NOT public.has_app_permission('purchases', 'view') THEN
    RAISE EXCEPTION 'No tienes permiso para ver el seguimiento de compras';
  END IF;

  INSERT INTO public.purchase_order_delivery_notifications(
    company_id, user_id, purchase_order_id, alert_type, delivery_due_date
  )
  SELECT
    order_row.company_id,
    auth.uid(),
    order_row.id,
    alert.alert_type,
    order_row.delivery_due_date
  FROM public.purchase_orders AS order_row
  CROSS JOIN LATERAL (
    VALUES
      ('dos_dias'::text),
      ('fecha_compromiso'::text),
      ('vencida'::text)
  ) AS alert(alert_type)
  WHERE order_row.company_id = active_company_id
    AND order_row.first_sent_at IS NOT NULL
    AND (
      (alert.alert_type = 'dos_dias' AND order_row.delivery_due_date = local_today + 2)
      OR (alert.alert_type = 'fecha_compromiso' AND order_row.delivery_due_date = local_today)
      OR (alert.alert_type = 'vencida' AND order_row.delivery_due_date < local_today)
    )
    AND order_row.status NOT IN ('completa', 'anulada', 'cerrada_con_diferencia')
    AND EXISTS (
      SELECT 1
      FROM public.purchase_order_items AS item
      WHERE item.purchase_order_id = order_row.id
        AND item.company_id = order_row.company_id
        AND item.item_type = 'producto'
        AND item.received_quantity < item.quantity
    )
  ON CONFLICT (company_id, user_id, purchase_order_id, alert_type, delivery_due_date)
  DO NOTHING;

  UPDATE public.purchase_order_delivery_notifications AS notification
  SET resolved_at = now()
  WHERE notification.company_id = active_company_id
    AND notification.user_id = auth.uid()
    AND notification.resolved_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.purchase_orders AS order_row
      WHERE order_row.id = notification.purchase_order_id
        AND order_row.company_id = active_company_id
        AND order_row.status NOT IN ('completa', 'anulada', 'cerrada_con_diferencia')
        AND order_row.delivery_due_date = notification.delivery_due_date
        AND EXISTS (
          SELECT 1
          FROM public.purchase_order_items AS item
          WHERE item.purchase_order_id = order_row.id
            AND item.company_id = order_row.company_id
            AND item.item_type = 'producto'
            AND item.received_quantity < item.quantity
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_purchase_order_delivery_notifications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_purchase_order_delivery_notifications() TO authenticated;

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
  JOIN public.company_memberships AS membership
    ON membership.user_id = profile.id
   AND membership.company_id = public.current_company_id()
   AND membership.is_active
  JOIN public.app_roles AS role ON role.id = membership.role_id
  WHERE profile.id = auth.uid();

  IF role_name IS NULL
     OR role_name NOT IN ('BODEGA', 'ADMIN', 'ADMINPRO')
     OR NOT public.has_app_permission('purchases', 'view')
     OR NOT public.has_app_permission('movements', 'create')
     OR (role_name <> 'BODEGA' AND NOT public.has_app_permission('purchases', 'edit')) THEN
    RAISE EXCEPTION 'No tienes permiso para registrar recepciones de órdenes de compra';
  END IF;

  IF p_document_type IS NULL OR p_document_type NOT IN ('factura', 'guia_despacho') THEN
    RAISE EXCEPTION 'Selecciona factura o guía de despacho';
  END IF;
  IF nullif(btrim(p_document_number), '') IS NULL THEN
    RAISE EXCEPTION 'Ingresa el número de factura o guía';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Ingresa las cantidades recibidas';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_lines) AS requested(value)
    WHERE coalesce((requested.value->>'quantity')::numeric, 0) > 0
  ) THEN
    RAISE EXCEPTION 'Ingresa al menos una cantidad recibida mayor que cero';
  END IF;

  SELECT *
  INTO order_row
  FROM public.purchase_orders
  WHERE id = p_order_id
    AND company_id = public.current_company_id()
  FOR UPDATE;
  IF order_row.id IS NULL
     OR order_row.status IN ('completa', 'anulada', 'cerrada_con_diferencia') THEN
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
      AND purchase_item.company_id = order_row.company_id
      AND purchase_item.item_type = 'producto'
  )
    AND product.company_id = order_row.company_id
  ORDER BY product.id
  FOR UPDATE;

  FOR item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    SELECT *
    INTO line_row
    FROM public.purchase_order_items
    WHERE id = (item->>'item_id')::uuid
      AND purchase_order_id = p_order_id
      AND company_id = order_row.company_id
    FOR UPDATE;
    IF line_row.id IS NULL OR line_row.item_type <> 'producto' OR line_row.product_id IS NULL THEN
      RAISE EXCEPTION 'Solo se pueden recepcionar productos de inventario';
    END IF;

    receive_quantity := coalesce((item->>'quantity')::numeric, 0);
    IF receive_quantity < 0
       OR receive_quantity <> trunc(receive_quantity)
       OR receive_quantity > line_row.quantity - line_row.received_quantity THEN
      RAISE EXCEPTION 'Las cantidades deben ser enteras, no negativas y no superar lo pendiente';
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
      WHERE id = line_row.id
        AND company_id = order_row.company_id;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM public.purchase_order_items
    WHERE purchase_order_id = p_order_id
      AND company_id = order_row.company_id
      AND item_type = 'producto'
      AND received_quantity < quantity
  ) THEN
    UPDATE public.purchase_orders
    SET status = 'completa',
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    WHERE id = p_order_id
      AND company_id = order_row.company_id;
  ELSE
    UPDATE public.purchase_orders
    SET status = 'parcial', updated_at = now()
    WHERE id = p_order_id
      AND company_id = order_row.company_id;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.stock_movements
  WHERE batch_id = batch
    AND company_id = order_row.company_id
  ORDER BY created_at, id;
END;
$$;

REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid, text, text, jsonb) TO authenticated;
