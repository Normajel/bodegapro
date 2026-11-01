-- Preserve current access while introducing individually configurable actions.
UPDATE public.app_roles r SET permissions = r.permissions || jsonb_build_object('purchases',
  (CASE WHEN jsonb_typeof(r.permissions->'purchases')='object' THEN r.permissions->'purchases' ELSE '{}'::jsonb END)
  || jsonb_build_object(
    'approve', CASE WHEN name IN ('ADMIN','ADMINPRO') THEN 'true'::jsonb ELSE coalesce(permissions#>'{purchases,approve}',to_jsonb(name='GERENCIA')) END,
    'receive', CASE WHEN name IN ('ADMIN','ADMINPRO') THEN 'true'::jsonb ELSE coalesce(permissions#>'{purchases,receive}',to_jsonb(name='BODEGA')) END,
    'send', CASE WHEN name IN ('ADMIN','ADMINPRO') THEN 'true'::jsonb ELSE coalesce(permissions#>'{purchases,send}',to_jsonb(coalesce(permissions#>'{purchases,edit}'='true'::jsonb,false))) END
  )), updated_at=now();

CREATE OR REPLACE FUNCTION public.can_approve_purchase_orders() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(
 SELECT 1 FROM public.profiles p JOIN public.app_roles r ON r.id=p.role_id WHERE p.id=auth.uid()
 AND public.has_app_permission('purchases','view')
 AND public.has_app_permission('purchases','approve')
 AND (r.name='GERENCIA' OR (r.name IN ('ADMIN','ADMINPRO') AND public.has_app_permission('purchases','edit'))));
$$;
-- Existing receipt and email transaction logic is preserved, with explicit action guards added.
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
     OR public.has_app_permission('purchases', 'receive') IS NOT TRUE
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

CREATE OR REPLACE FUNCTION private.begin_purchase_order_email(p_order_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE o public.purchase_orders%ROWTYPE; s public.suppliers%ROWTYPE; e public.purchase_order_email_events%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.has_app_permission('purchases','view'),false)
    OR NOT coalesce(public.has_app_permission('purchases','edit'),false)
    OR NOT coalesce(public.has_app_permission('purchases','send'),false) THEN
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


