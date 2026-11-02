-- Catálogo independiente: nunca altera products ni stock_movements.
CREATE SEQUENCE public.special_product_sku_seq MAXVALUE 999999 NO CYCLE;
CREATE FUNCTION public.can_access_special_products() RETURNS boolean LANGUAGE sql STABLE
SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
 SELECT 1 FROM public.profiles p JOIN public.app_roles r ON r.id=p.role_id
 WHERE p.id=auth.uid() AND upper(r.name) IN ('ADMIN','ADMINPRO','VENTA','VENTAS'))
 AND (public.has_app_permission('special_inventory','view'));
$$;
REVOKE ALL ON FUNCTION public.can_access_special_products() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_access_special_products() TO authenticated;
CREATE TABLE public.special_products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sku text NOT NULL UNIQUE DEFAULT ('ESP'||lpad(nextval('public.special_product_sku_seq')::text,6,'0')) CHECK (sku ~ '^ESP[0-9]{6}$'),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
 category text NOT NULL CHECK (length(btrim(category))>0),
 unit text NOT NULL DEFAULT 'unidad' CHECK (length(btrim(unit))>0),
 supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
 unit_cost numeric NOT NULL DEFAULT 0 CHECK(unit_cost>=0),
 barcode text, location text, active boolean NOT NULL DEFAULT true,
 created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.special_products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.special_products FROM anon,authenticated;
GRANT SELECT,INSERT ON public.special_products TO authenticated;
GRANT USAGE ON SEQUENCE public.special_product_sku_seq TO authenticated;
CREATE POLICY special_products_read ON public.special_products FOR SELECT TO authenticated USING(public.can_access_special_products());
CREATE POLICY special_products_create ON public.special_products FOR INSERT TO authenticated WITH CHECK(public.can_access_special_products() AND public.has_app_permission('special_inventory','create') AND created_by=auth.uid());
CREATE INDEX special_products_name_idx ON public.special_products(name);
ALTER TABLE public.purchase_order_items ADD COLUMN special_product_id uuid REFERENCES public.special_products(id) ON DELETE RESTRICT;
ALTER TABLE public.purchase_order_items DROP CONSTRAINT purchase_order_items_kind_description_check;
ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_kind_description_check CHECK (
 (item_type='producto' AND num_nonnulls(product_id,special_product_id)=1) OR
 (item_type='servicio' AND num_nonnulls(product_id,special_product_id)=0));
CREATE INDEX purchase_order_items_special_idx ON public.purchase_order_items(special_product_id) WHERE special_product_id IS NOT NULL;
CREATE TABLE public.special_product_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), special_product_id uuid NOT NULL REFERENCES public.special_products(id),
 purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
 purchase_order_item_id uuid NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE RESTRICT,
 supplier_id uuid NOT NULL REFERENCES public.suppliers(id), supplier_name text NOT NULL,
 purchase_date date NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
 quantity numeric NOT NULL CHECK(quantity>0 AND quantity=trunc(quantity)),
 unit_cost numeric NOT NULL CHECK(unit_cost>=0), total_cost numeric GENERATED ALWAYS AS (quantity*unit_cost) STORED,
 document_type text NOT NULL, document_number text NOT NULL, batch_id uuid NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id), UNIQUE(batch_id,purchase_order_item_id)
);
ALTER TABLE public.special_product_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.special_product_receipts FROM anon,authenticated;
GRANT SELECT ON public.special_product_receipts TO authenticated;
CREATE POLICY special_receipts_read ON public.special_product_receipts FOR SELECT TO authenticated USING(public.can_access_special_products());
CREATE INDEX special_receipts_product_idx ON public.special_product_receipts(special_product_id,purchase_date);
CREATE TABLE public.special_cubication_documents (
 id uuid PRIMARY KEY, unit_code text NOT NULL, context jsonb NOT NULL DEFAULT '{}',
 created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.special_cubication_lines (
 document_id uuid NOT NULL REFERENCES public.special_cubication_documents(id) ON DELETE CASCADE,
 line_id uuid NOT NULL, special_product_id uuid NOT NULL REFERENCES public.special_products(id),
 quantity numeric NOT NULL CHECK(quantity>0 AND quantity=trunc(quantity)),
 unit_cost numeric NOT NULL CHECK(unit_cost>=0), total_cost numeric GENERATED ALWAYS AS (quantity*unit_cost) STORED,
 PRIMARY KEY(document_id,line_id)
);
CREATE TABLE public.cubication_special_items (
 template_id uuid NOT NULL REFERENCES public.cubication_templates(id) ON DELETE CASCADE,
 line_id uuid NOT NULL, special_product_id uuid NOT NULL REFERENCES public.special_products(id),
 quantity numeric NOT NULL CHECK(quantity>0 AND quantity=trunc(quantity)), unit_cost numeric NOT NULL CHECK(unit_cost>=0),
 PRIMARY KEY(template_id,line_id)
);
ALTER TABLE public.special_cubication_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.special_cubication_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cubication_special_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.special_cubication_documents,public.special_cubication_lines,public.cubication_special_items FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.special_cubication_documents TO authenticated;
GRANT SELECT,INSERT,DELETE ON public.special_cubication_lines,public.cubication_special_items TO authenticated;
CREATE POLICY special_docs_read ON public.special_cubication_documents FOR SELECT TO authenticated USING(public.can_access_special_products());
CREATE POLICY special_docs_insert ON public.special_cubication_documents FOR INSERT TO authenticated WITH CHECK(public.can_access_special_products() AND created_by=auth.uid());
CREATE POLICY special_docs_update ON public.special_cubication_documents FOR UPDATE TO authenticated USING(public.can_access_special_products() AND created_by=auth.uid()) WITH CHECK(public.can_access_special_products() AND created_by=auth.uid());
CREATE POLICY special_lines_read ON public.special_cubication_lines FOR SELECT TO authenticated USING(public.can_access_special_products());
CREATE POLICY special_lines_insert ON public.special_cubication_lines FOR INSERT TO authenticated WITH CHECK(public.can_access_special_products() AND EXISTS(SELECT 1 FROM public.special_cubication_documents d WHERE d.id=document_id AND d.created_by=auth.uid()));
CREATE POLICY special_lines_delete ON public.special_cubication_lines FOR DELETE TO authenticated USING(public.can_access_special_products() AND EXISTS(SELECT 1 FROM public.special_cubication_documents d WHERE d.id=document_id AND d.created_by=auth.uid()));
CREATE POLICY special_template_read ON public.cubication_special_items FOR SELECT TO authenticated USING(public.can_access_special_products());
CREATE POLICY special_template_insert ON public.cubication_special_items FOR INSERT TO authenticated WITH CHECK(public.can_access_special_products() AND public.has_app_permission('cubication','edit'));
CREATE POLICY special_template_delete ON public.cubication_special_items FOR DELETE TO authenticated USING(public.can_access_special_products() AND public.has_app_permission('cubication','edit'));
-- Reparar el permiso histórico de cubicación: Ventas no necesita editar Movimientos.
ALTER POLICY "Read cubication templates" ON public.cubication_templates USING(public.has_app_permission('cubication','view'));
ALTER POLICY "Insert cubication templates" ON public.cubication_templates WITH CHECK(public.has_app_permission('cubication','edit'));
ALTER POLICY "Update cubication templates" ON public.cubication_templates USING(public.has_app_permission('cubication','edit')) WITH CHECK(public.has_app_permission('cubication','edit'));
ALTER POLICY "Delete cubication templates" ON public.cubication_templates USING(public.has_app_permission('cubication','edit'));
ALTER POLICY "Read cubication items" ON public.cubication_template_items USING(public.has_app_permission('cubication','view'));
ALTER POLICY "Insert cubication items" ON public.cubication_template_items WITH CHECK(public.has_app_permission('cubication','edit'));
ALTER POLICY "Update cubication items" ON public.cubication_template_items USING(public.has_app_permission('cubication','edit')) WITH CHECK(public.has_app_permission('cubication','edit'));
ALTER POLICY "Delete cubication items" ON public.cubication_template_items USING(public.has_app_permission('cubication','edit'));
CREATE OR REPLACE FUNCTION public.save_purchase_order(p_supplier_id uuid, p_notes text, p_lines jsonb, p_order_id uuid DEFAULT NULL::uuid, p_cost_center_id uuid DEFAULT NULL::uuid, p_order_date date DEFAULT CURRENT_DATE, p_payment_terms text DEFAULT 'contado'::text, p_payment_terms_other text DEFAULT NULL::text, p_description text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  order_id uuid;
  order_number text;
  item jsonb;
  item_type text;
  item_description text;
  item_product_id uuid;
  item_special_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión'; END IF;
  IF p_supplier_id IS NULL THEN RAISE EXCEPTION 'Selecciona un proveedor'; END IF;
  IF p_order_date IS NULL THEN RAISE EXCEPTION 'Selecciona la fecha de la orden'; END IF;
  IF p_payment_terms IS NULL OR p_payment_terms NOT IN (
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
    item_special_id := nullif(item->>'special_product_id', '')::uuid;
    IF item_special_id IS NOT NULL AND public.can_access_special_products() IS NOT TRUE THEN
      RAISE EXCEPTION 'No tienes acceso a productos especiales';
    END IF;

    IF coalesce((item->>'quantity')::numeric, 0) <= 0
       OR coalesce((item->>'unit_cost')::numeric, -1) < 0
       OR nullif(btrim(item->>'measure_unit'), '') IS NULL THEN
      RAISE EXCEPTION 'Revisa cantidades, unidades y precios netos de la orden';
    END IF;
    IF item_type NOT IN ('producto', 'servicio') THEN
      RAISE EXCEPTION 'Selecciona un tipo de línea válido';
    END IF;
    IF item_type = 'producto' AND num_nonnulls(item_product_id,item_special_id) <> 1 THEN
      RAISE EXCEPTION 'Selecciona un producto para cada línea de producto';
    END IF;
    IF item_type = 'servicio' AND num_nonnulls(item_product_id,item_special_id) > 0 THEN
      RAISE EXCEPTION 'Las líneas de servicio no pueden asociarse a productos de inventario';
    END IF;
    IF item_type = 'producto' AND item_description IS NULL THEN
      IF item_special_id IS NOT NULL THEN
        SELECT name INTO item_description FROM public.special_products WHERE id=item_special_id;
      ELSE
        SELECT name INTO item_description FROM public.products WHERE id = item_product_id;
      END IF;
    END IF;
    IF item_description IS NULL THEN
      RAISE EXCEPTION 'Agrega una descripción para cada producto o servicio';
    END IF;

    INSERT INTO public.purchase_order_items(
      purchase_order_id, item_type, description, product_id, special_product_id,
      quantity, measure_unit, unit_cost
    )
    VALUES (
      order_id, item_type, item_description, item_product_id, item_special_id,
      (item->>'quantity')::numeric, btrim(item->>'measure_unit'), (item->>'unit_cost')::numeric
    );
  END LOOP;

  RETURN order_id;
END $function$;

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
    IF line_row.id IS NULL OR line_row.item_type <> 'producto' OR num_nonnulls(line_row.product_id,line_row.special_product_id) <> 1 THEN
      RAISE EXCEPTION 'Solo se pueden recepcionar productos de inventario';
    END IF;

    receive_quantity := coalesce((item->>'quantity')::numeric, 0);
    IF receive_quantity <> trunc(receive_quantity) OR receive_quantity < 0 OR receive_quantity > line_row.quantity - line_row.received_quantity THEN
      RAISE EXCEPTION 'La cantidad recibida supera lo pendiente para el producto';
    END IF;

    IF receive_quantity > 0 THEN
      IF line_row.special_product_id IS NOT NULL THEN
        INSERT INTO public.special_product_receipts(special_product_id,purchase_order_id,purchase_order_item_id,
          supplier_id,supplier_name,purchase_date,quantity,unit_cost,document_type,document_number,batch_id,created_by)
        SELECT line_row.special_product_id,p_order_id,line_row.id,order_row.supplier_id,s.name,order_row.order_date,
          receive_quantity,line_row.unit_cost,p_document_type,btrim(p_document_number),batch,auth.uid()
        FROM public.suppliers s WHERE s.id=order_row.supplier_id;
      ELSE
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
      END IF;
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

CREATE OR REPLACE FUNCTION public.save_cubication_template(p_unit_code text, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF public.has_app_permission('cubication', 'edit') IS NOT TRUE THEN
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


CREATE FUNCTION public.save_special_cubication(p_document_id uuid,p_unit_code text,p_context jsonb,p_lines jsonb,p_save_template boolean DEFAULT false,p_items jsonb DEFAULT '[]') RETURNS uuid
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_template uuid;
BEGIN
 IF public.can_access_special_products() IS NOT TRUE OR public.has_app_permission('cubication','edit') IS NOT TRUE THEN RAISE EXCEPTION 'No tienes permiso para guardar cubicaciones especiales'; END IF;
 IF p_document_id IS NULL OR nullif(btrim(p_unit_code),'') IS NULL OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Planilla especial inválida'; END IF;
 -- El mismo documento se reemplaza, nunca se acumula al volver a imprimir.
 INSERT INTO public.special_cubication_documents(id,unit_code,context) VALUES(p_document_id,p_unit_code,coalesce(p_context,'{}'))
 ON CONFLICT(id) DO UPDATE SET unit_code=excluded.unit_code,context=excluded.context,updated_at=now();
 DELETE FROM public.special_cubication_lines WHERE document_id=p_document_id;
 INSERT INTO public.special_cubication_lines(document_id,line_id,special_product_id,quantity,unit_cost)
 SELECT p_document_id,(x->>'line_id')::uuid,(x->>'special_product_id')::uuid,(x->>'quantity')::numeric,(x->>'unit_cost')::numeric FROM jsonb_array_elements(p_lines) x;
 IF p_save_template THEN
  v_template:=public.save_cubication_template(p_unit_code,p_items);
  DELETE FROM public.cubication_special_items WHERE template_id=v_template;
  INSERT INTO public.cubication_special_items(template_id,line_id,special_product_id,quantity,unit_cost)
  SELECT v_template,(x->>'line_id')::uuid,(x->>'special_product_id')::uuid,(x->>'quantity')::numeric,(x->>'unit_cost')::numeric FROM jsonb_array_elements(p_lines) x;
 END IF;
 RETURN p_document_id;
END $$;
REVOKE ALL ON FUNCTION public.save_special_cubication(uuid,text,jsonb,jsonb,boolean,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_special_cubication(uuid,text,jsonb,jsonb,boolean,jsonb) TO authenticated;
-- Historial limitado: Ventas puede consultar compras especiales sin acceso al inventario general ni a otras OC.
CREATE FUNCTION private.special_product_history(p_product_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF public.can_access_special_products() IS NOT TRUE THEN RAISE EXCEPTION 'No tienes acceso a productos especiales'; END IF;
 RETURN jsonb_build_object(
 'purchases',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'purchase_date',r.purchase_date,'received_at',r.received_at,'supplier_name',r.supplier_name,'order_number',o.order_number,'quantity',r.quantity,'unit_cost',r.unit_cost,'total_cost',r.total_cost,'document_number',r.document_number,'status',o.status) ORDER BY r.received_at DESC) FROM public.special_product_receipts r JOIN public.purchase_orders o ON o.id=r.purchase_order_id WHERE r.special_product_id=p_product_id),'[]'::jsonb),
 'orders',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'order_number',o.order_number,'purchase_date',o.order_date,'supplier_name',s.name,'quantity',i.quantity,'received_quantity',i.received_quantity,'unit_cost',i.unit_cost,'total_cost',i.quantity*i.unit_cost,'status',o.status,'approval_status',o.approval_status) ORDER BY o.order_date DESC) FROM public.purchase_order_items i JOIN public.purchase_orders o ON o.id=i.purchase_order_id JOIN public.suppliers s ON s.id=o.supplier_id WHERE i.special_product_id=p_product_id),'[]'::jsonb),
 'usage',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'unit_code',d.unit_code,'context',d.context,'created_at',d.created_at,'quantity',l.quantity,'unit_cost',l.unit_cost,'total_cost',l.total_cost) ORDER BY d.created_at DESC) FROM public.special_cubication_lines l JOIN public.special_cubication_documents d ON d.id=l.document_id WHERE l.special_product_id=p_product_id),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION private.special_product_history(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.get_special_product_history(p_product_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.special_product_history(p_product_id) $$;
REVOKE ALL ON FUNCTION public.get_special_product_history(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_special_product_history(uuid) TO authenticated;
-- La actualización se ejecuta como migración, sin modificar otros permisos.
UPDATE public.app_roles SET permissions=jsonb_set(permissions,'{special_inventory}','{"view":true,"create":true}'::jsonb) WHERE upper(name) IN ('ADMIN','ADMINPRO','VENTA','VENTAS');
NOTIFY pgrst,'reload schema';
