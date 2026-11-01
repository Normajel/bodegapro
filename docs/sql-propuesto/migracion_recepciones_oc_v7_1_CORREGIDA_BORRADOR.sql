-- V7.1 CORREGIDA - CANDIDATA PARA PRUEBAS LOCALES, NO PRODUCCION.
-- Basada en v6; NO ejecutar sin verificar dependencias, permisos y respaldo.
-- Esta version NO se ha ejecutado contra PostgreSQL real; requiere pruebas aisladas.
-- Ajustes v7.1: preflight de columnas/atributos y membresias, CREATE temporal para ALTER OWNER,
-- GRANT EXECUTE de helper y rechazo de fracciones en editar_entrada_documento.
-- Revisar antes: otras funciones que editen received_quantity, grants heredados
-- y posibilidad de INSERT/DELETE de líneas desde flujos de edición de OC.
BEGIN;
-- Falla de forma segura si no existen las tablas y columnas imprescindibles.
DO $preflight$
BEGIN
  IF to_regclass('public.purchase_orders') IS NULL
     OR to_regclass('public.purchase_order_items') IS NULL
     OR to_regclass('public.stock_movements') IS NULL
     OR to_regclass('public.products') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('public.app_roles') IS NULL THEN
    RAISE EXCEPTION 'V7: faltan tablas necesarias; no instalar';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='oc_receipt_executor'
             AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'V7: rol tecnico existente tiene atributos privilegiados; no instalar';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='oc_receipt_executor') THEN
    IF pg_has_role('authenticated','oc_receipt_executor','MEMBER')
       OR pg_has_role('anon','oc_receipt_executor','MEMBER')
       OR pg_has_role('service_role','oc_receipt_executor','MEMBER') THEN
      RAISE EXCEPTION 'V7: un rol cliente puede asumir oc_receipt_executor; no instalar';
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('purchase_orders','id'),('purchase_orders','status'),('purchase_orders','approval_status'),
      ('purchase_orders','supplier_id'),('purchase_orders','order_number'),('purchase_orders','updated_at'),
      ('purchase_order_items','id'),('purchase_order_items','purchase_order_id'),
      ('purchase_order_items','product_id'),('purchase_order_items','item_type'),
      ('purchase_order_items','quantity'),('purchase_order_items','received_quantity'),
      ('purchase_order_items','measure_unit'),('purchase_order_items','unit_cost'),
      ('products','id'),('products','stock'),('products','updated_at'),
      ('stock_movements','id'),('stock_movements','product_id'),('stock_movements','type'),
      ('stock_movements','quantity'),('stock_movements','purchase_order_id'),
      ('stock_movements','purchase_order_item_id'),('stock_movements','batch_id'),('stock_movements','created_by')
    ) AS required(table_name,column_name)
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema='public' AND c.table_name=required.table_name
        AND c.column_name=required.column_name)
  ) THEN
    RAISE EXCEPTION 'V7: faltan columnas requeridas; no instalar';
  END IF;
END;
$preflight$;

-- A) Evitar manipular recepciones por INSERT/UPDATE/DELETE de líneas.
-- En INSERT se permite received_quantity=0 o NULL; se normaliza a 0.
-- En UPDATE solo el propietario de confianza de la RPC puede cambiar recibidas;
-- los usuarios normales no tienen privilegio de columna.
CREATE OR REPLACE FUNCTION public.guard_purchase_order_item_receipts()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $guard$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.received_quantity,0) <> 0 THEN
      RAISE EXCEPTION 'Una línea nueva no puede incluir cantidades recibidas';
    END IF;
    NEW.received_quantity := 0;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF coalesce(OLD.received_quantity,0) > 0 THEN
      RAISE EXCEPTION 'No se puede eliminar una línea con recepciones';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.received_quantity IS DISTINCT FROM OLD.received_quantity
     AND current_user <> 'oc_receipt_executor' THEN
    RAISE EXCEPTION 'La cantidad recibida solo puede cambiar mediante la función autorizada';
  END IF;
  IF NEW.quantity < coalesce(OLD.received_quantity,0)
     OR NEW.quantity < coalesce(NEW.received_quantity,0) THEN
    RAISE EXCEPTION 'No se puede reducir la cantidad solicitada bajo lo recibido';
  END IF;
  IF coalesce(OLD.received_quantity,0) > 0
     AND (NEW.product_id IS DISTINCT FROM OLD.product_id
          OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
          OR NEW.item_type IS DISTINCT FROM OLD.item_type) THEN
    RAISE EXCEPTION 'No se puede reasignar una línea ya recepcionada';
  END IF;
  RETURN NEW;
END;
$guard$;
DROP TRIGGER IF EXISTS guard_purchase_order_item_receipts ON public.purchase_order_items;
CREATE TRIGGER guard_purchase_order_item_receipts
BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_order_items
FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_order_item_receipts();

-- B) La función de protección de UPDATE/DELETE se define una sola vez abajo.
-- Rol técnico NOLOGIN, exclusivo de la función de recepción formal.
-- No otorgar membresía de este rol a authenticated, anon ni service_role.
DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oc_receipt_executor') THEN
    CREATE ROLE oc_receipt_executor NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$role$;
GRANT USAGE ON SCHEMA public TO oc_receipt_executor;
-- PostgreSQL exige CREATE en el esquema al transferir la propiedad de la RPC.
-- Se concede temporalmente y se revoca inmediatamente después del ALTER OWNER.
GRANT CREATE ON SCHEMA public TO oc_receipt_executor;
GRANT EXECUTE ON FUNCTION public.has_app_permission(text,text) TO oc_receipt_executor;
GRANT SELECT ON public.profiles, public.app_roles, public.products,
  public.purchase_orders, public.purchase_order_items, public.stock_movements
  TO oc_receipt_executor;
-- El trigger de stock de INSERT/DELETE actualiza products como invocador.
-- Conceder solo las columnas de stock al rol técnico NOLOGIN; nunca al cliente.
GRANT UPDATE (stock,updated_at) ON public.products TO oc_receipt_executor;
DROP POLICY IF EXISTS oc_receipt_update_product_stock ON public.products;
CREATE POLICY oc_receipt_update_product_stock ON public.products
FOR UPDATE TO oc_receipt_executor USING (true) WITH CHECK (true);
GRANT UPDATE (status,updated_at) ON public.purchase_orders TO oc_receipt_executor;
GRANT UPDATE (received_quantity) ON public.purchase_order_items TO oc_receipt_executor;
GRANT INSERT ON public.stock_movements TO oc_receipt_executor;
-- Políticas específicas: la función comprueba auth.uid() y permisos antes de escribir.
DROP POLICY IF EXISTS oc_receipt_read_profiles ON public.profiles;
CREATE POLICY oc_receipt_read_profiles ON public.profiles FOR SELECT TO oc_receipt_executor USING (true);
DROP POLICY IF EXISTS oc_receipt_read_roles ON public.app_roles;
CREATE POLICY oc_receipt_read_roles ON public.app_roles FOR SELECT TO oc_receipt_executor USING (true);
DROP POLICY IF EXISTS oc_receipt_read_products ON public.products;
CREATE POLICY oc_receipt_read_products ON public.products FOR SELECT TO oc_receipt_executor USING (true);
DROP POLICY IF EXISTS oc_receipt_read_orders ON public.purchase_orders;
CREATE POLICY oc_receipt_read_orders ON public.purchase_orders FOR SELECT TO oc_receipt_executor USING (true);
DROP POLICY IF EXISTS oc_receipt_read_items ON public.purchase_order_items;
CREATE POLICY oc_receipt_read_items ON public.purchase_order_items FOR SELECT TO oc_receipt_executor USING (true);
DROP POLICY IF EXISTS oc_receipt_read_movements ON public.stock_movements;
CREATE POLICY oc_receipt_read_movements ON public.stock_movements FOR SELECT TO oc_receipt_executor USING (true);
DROP POLICY IF EXISTS oc_receipt_update_orders ON public.purchase_orders;
CREATE POLICY oc_receipt_update_orders ON public.purchase_orders FOR UPDATE TO oc_receipt_executor USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS oc_receipt_update_items ON public.purchase_order_items;
CREATE POLICY oc_receipt_update_items ON public.purchase_order_items FOR UPDATE TO oc_receipt_executor USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS oc_receipt_insert_movements ON public.stock_movements;
CREATE POLICY oc_receipt_insert_movements ON public.stock_movements FOR INSERT TO oc_receipt_executor WITH CHECK (true);

-- B2) Bloquear INSERT directo de vínculos formales de recepción.
-- LIMITACIÓN: current_user=postgres NO identifica exclusivamente a la RPC;
-- otras funciones SECURITY DEFINER de postgres requieren auditoría antes de instalar.
-- purchase_order (texto) NO se usa para decidir: es una referencia libre
-- utilizada por registrar_entrada_compra y otras rutas independientes.
CREATE OR REPLACE FUNCTION public.guard_oc_stock_movement_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $guard$
BEGIN
  IF NEW.purchase_order_id IS NOT NULL OR NEW.purchase_order_item_id IS NOT NULL THEN
    IF current_user <> 'oc_receipt_executor' THEN
      RAISE EXCEPTION 'La recepción de OC debe registrarse mediante la función autorizada';
    END IF;
    IF NEW.purchase_order_id IS NULL OR NEW.purchase_order_item_id IS NULL
       OR NEW.type IS DISTINCT FROM 'entrada' THEN
      RAISE EXCEPTION 'Vinculación de recepción de OC incompleta o inválida';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_order_items poi
      WHERE poi.id = NEW.purchase_order_item_id
        AND poi.purchase_order_id = NEW.purchase_order_id
        AND poi.product_id = NEW.product_id
        AND poi.item_type = 'producto'
    ) THEN
      RAISE EXCEPTION 'La línea de OC no corresponde al producto';
    END IF;
  END IF;
  RETURN NEW;
END;
$guard$;
DROP TRIGGER IF EXISTS guard_oc_stock_movement_insert ON public.stock_movements;
CREATE TRIGGER guard_oc_stock_movement_insert
BEFORE INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.guard_oc_stock_movement_insert();

-- B3) Evitar que UPDATE transforme un movimiento independiente en vinculado a OC.
CREATE OR REPLACE FUNCTION public.guard_oc_stock_movement_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $guard$
BEGIN
  IF OLD.purchase_order_id IS NOT NULL OR OLD.purchase_order_item_id IS NOT NULL
     OR (TG_OP = 'UPDATE' AND
        (NEW.purchase_order_id IS NOT NULL OR NEW.purchase_order_item_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Los movimientos vinculados a OC no se pueden editar ni eliminar directamente';
  END IF;
  -- DELETE devuelve OLD; UPDATE debe devolver NEW para conservar la edición legítima.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$guard$;

DROP TRIGGER IF EXISTS guard_oc_stock_movement_mutation ON public.stock_movements;
CREATE TRIGGER guard_oc_stock_movement_mutation
BEFORE UPDATE OR DELETE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.guard_oc_stock_movement_mutation();

-- C) RPC autorizada, bajo el propietario de confianza postgres.
-- PRECAUCIÓN: no instalar hasta cerrar auditoría de funciones privilegiadas,
-- privilegios de columnas y pruebas de integración con respaldo.
CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_order_id uuid, p_document_type text, p_document_number text, p_lines jsonb
)
RETURNS SETOF public.stock_movements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_order public.purchase_orders%ROWTYPE;
  v_line public.purchase_order_items%ROWTYPE;
  v_item jsonb;
  v_qty numeric;
  v_batch uuid := gen_random_uuid();
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;
  SELECT upper(btrim(r.name)) INTO v_role
  FROM public.profiles p JOIN public.app_roles r ON r.id = p.role_id
  WHERE p.id = auth.uid();

  IF v_role IS NULL OR v_role NOT IN ('BODEGA','ADMIN','ADMINPRO') THEN
    RAISE EXCEPTION 'Perfil no autorizado para recibir compras';
  END IF;
  IF NOT public.has_app_permission('purchases','view')
     OR NOT public.has_app_permission('movements','create') THEN
    RAISE EXCEPTION 'No tienes permisos de recepción';
  END IF;
  IF v_role IN ('ADMIN','ADMINPRO')
     AND NOT public.has_app_permission('purchases','edit') THEN
    RAISE EXCEPTION 'Permisos administrativos insuficientes';
  END IF;

  IF p_document_type IS NULL OR p_document_type NOT IN ('factura','guia_despacho') THEN
    RAISE EXCEPTION 'Selecciona factura o guía de despacho';
  END IF;
  IF nullif(btrim(p_document_number),'') IS NULL THEN
    RAISE EXCEPTION 'Ingresa el número de documento';
  END IF;
  IF coalesce(jsonb_typeof(p_lines),'null') <> 'array' THEN
    RAISE EXCEPTION 'Las líneas deben ser una lista';
  END IF;
  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'La recepción no puede estar vacía';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) x(value)
    WHERE jsonb_typeof(x.value) <> 'object'
       OR coalesce(jsonb_typeof(x.value->'quantity'),'null') <> 'number'
       OR coalesce(x.value->>'item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'Línea inválida: item_id UUID y cantidad numérica obligatorios';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) x(value)
    GROUP BY x.value->>'item_id' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'No se permiten líneas duplicadas';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) x(value)
    WHERE (x.value->>'quantity')::numeric < 0
       OR (x.value->>'quantity')::numeric <> trunc((x.value->>'quantity')::numeric)
  ) THEN
    RAISE EXCEPTION 'Las cantidades deben ser enteras no negativas';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) x(value)
    WHERE (x.value->>'quantity')::numeric > 0
  ) THEN
    RAISE EXCEPTION 'Ingresa una cantidad positiva';
  END IF;

  SELECT * INTO v_order FROM public.purchase_orders
  WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.status NOT IN ('pendiente','parcial') THEN
    RAISE EXCEPTION 'OC no disponible para recepción';
  END IF;
  IF v_order.approval_status IS DISTINCT FROM 'aprobada' THEN
    RAISE EXCEPTION 'OC no aprobada';
  END IF;

  -- Mantener el orden de bloqueo de productos para reducir interbloqueos.
  PERFORM product.id FROM public.products AS product
  WHERE product.id IN (
    SELECT poi.product_id FROM public.purchase_order_items poi
    JOIN jsonb_array_elements(p_lines) requested(value)
      ON (requested.value->>'item_id')::uuid = poi.id
    WHERE poi.purchase_order_id = p_order_id AND poi.item_type = 'producto'
  ) ORDER BY product.id FOR UPDATE;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_line FROM public.purchase_order_items
    WHERE id = (v_item->>'item_id')::uuid AND purchase_order_id = p_order_id
    FOR UPDATE;
    IF v_line.id IS NULL OR v_line.item_type <> 'producto' OR v_line.product_id IS NULL THEN
      RAISE EXCEPTION 'Solo se reciben productos de esta OC';
    END IF;
    v_qty := (v_item->>'quantity')::numeric;
    IF v_qty > v_line.quantity - v_line.received_quantity THEN
      RAISE EXCEPTION 'La cantidad supera lo pendiente';
    END IF;
    IF v_qty > 0 THEN
      INSERT INTO public.stock_movements(
        product_id,type,quantity,quantity_value,measure_unit,unit_cost,
        supplier_id,purchase_order,purchase_order_id,purchase_order_item_id,
        document_type,document_number,batch_id,created_by
      ) VALUES (
        v_line.product_id,'entrada',v_qty,v_qty,v_line.measure_unit,v_line.unit_cost,
        v_order.supplier_id,v_order.order_number,p_order_id,v_line.id,
        p_document_type,btrim(p_document_number),v_batch,auth.uid()
      );
      UPDATE public.purchase_order_items
      SET received_quantity = received_quantity + v_qty
      WHERE id = v_line.id;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.purchase_order_items
    WHERE purchase_order_id = p_order_id AND item_type = 'producto'
      AND received_quantity < quantity
  ) THEN
    UPDATE public.purchase_orders SET status='completa',updated_at=now()
    WHERE id=p_order_id;
  ELSE
    UPDATE public.purchase_orders SET status='parcial',updated_at=now()
    WHERE id=p_order_id;
  END IF;
  RETURN QUERY SELECT * FROM public.stock_movements
  WHERE batch_id=v_batch ORDER BY created_at,id;
END;
$fn$;


-- D) Restringir UPDATE general: IMPORTANTE verificar funciones invocadoras
-- de save_purchase_order y grants indirectos antes de aplicar en produccion.
-- Si una RPC SECURITY DEFINER necesita actualizar received_quantity, debe
-- revisarse individualmente; NO conceder ese campo a authenticated.
REVOKE UPDATE ON TABLE public.purchase_order_items FROM PUBLIC, anon, authenticated;
GRANT UPDATE (
  purchase_order_id, product_id, quantity, measure_unit,
  unit_cost, item_type, description, line_total
) ON TABLE public.purchase_order_items TO authenticated;
-- Transferir propiedad para que current_user sea exclusivo de la RPC.
ALTER FUNCTION public.receive_purchase_order(uuid,text,text,jsonb) OWNER TO oc_receipt_executor;
REVOKE CREATE ON SCHEMA public FROM oc_receipt_executor;
REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid,text,text,jsonb) TO authenticated;
-- Las funciones de trigger no necesitan EXECUTE concedido a clientes.
REVOKE ALL ON FUNCTION public.guard_purchase_order_item_receipts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_oc_stock_movement_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_oc_stock_movement_insert() FROM PUBLIC, anon, authenticated;
-- VERIFICACION ADICIONAL: NO confiar en el mero nombre del rol de UI.
-- La RPC valida perfil y permisos consultando la base.
-- BLOQUEADORES DE DESPLIEGUE:
-- 1. Validar permisos efectivos del rol NOLOGIN y políticas RLS en entorno aislado.
--    Verificar que ningún rol cliente pueda asumir oc_receipt_executor.
-- 2. Comprobar permisos de UPDATE heredados por PUBLIC y otros roles.
-- 3. Validar RLS de INSERT/DELETE de líneas y cambios de OC ya aprobada.
-- 4. Probar RPC con JWT real BODEGA, ADMIN, ADMINPRO y GERENCIA.
-- 5. Probar ediciones legítimas, recepción parcial/completa y triggers de stock.
-- 6. Revisar si otras funciones SECURITY DEFINER requieren modificar líneas.
-- 7. Probar que registrar_entrada_compra/editar_entrada_compra sigan funcionando
--    con purchase_order (texto) y sin IDs formales.
-- 8. Hacer respaldo antes de aplicar. No desplegar sin estas verificaciones.
-- 9. Confirmar propietario y seguridad de has_app_permission, triggers y
--    otras funciones SECURITY DEFINER que operen sobre stock y recepciones.
-- 10. Confirmar que RLS y privilegios del rol tecnico permiten toda la RPC.
-- 11. Confirmar que ninguna ruta directa altera OC aprobadas o lineas recibidas.
-- 12. Confirmar que no hay politicas de INSERT/DELETE que permitan eludir
--     protecciones de lineas mediante sustitucion de una OC aprobada.
-- 13. save_purchase_order edita lineas con DELETE + INSERT (no UPDATE):
--     validar RLS de DELETE/INSERT para perfiles que editan OC; no ampliar
--     permisos de BODEGA ni permitir sustituir lineas de OC aprobadas.
-- 14. El propietario oc_receipt_executor debe conservar NOLOGIN/NOINHERIT,
--     sin membresias concedidas a roles cliente y sin BYPASSRLS.
-- 15. Probar que la RPC puede invocar has_app_permission y los triggers
--     pueden actualizar products.stock/updated_at sin duplicar stock_quantity.

-- D) Protecciones de edición y anulación: definiciones completas vigentes.
-- Estas funciones rechazan movimientos con vínculos formales a OC.
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
  IF NOT public.has_app_permission('purchases', 'delete') THEN
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

  IF EXISTS (SELECT 1 FROM public.stock_movements m WHERE m.id = ANY(p_movement_ids) AND (m.purchase_order_id IS NOT NULL OR m.purchase_order_item_id IS NOT NULL)) THEN RAISE EXCEPTION 'Recepcion de OC protegida: use el flujo de ordenes de compra'; END IF;
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
  IF NOT public.has_app_permission('purchases', 'edit') THEN
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

  IF EXISTS (SELECT 1 FROM public.stock_movements m WHERE m.id = ANY(p_movement_ids) AND (m.purchase_order_id IS NOT NULL OR m.purchase_order_item_id IS NOT NULL)) THEN RAISE EXCEPTION 'Recepcion de OC protegida: use el flujo de ordenes de compra'; END IF;
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
       OR item_quantity <> trunc(item_quantity)
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
          quantity = item_quantity,
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
        item_product_id, 'entrada', item_quantity,
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

-- Nota: la edición de entradas independientes ahora rechaza fracciones
-- explícitamente en lugar de redondearlas silenciosamente.
-- Fin de transacción: incluye las funciones de edición y anulación.
COMMIT;
