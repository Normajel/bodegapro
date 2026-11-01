-- MIGRACIÓN INTEGRADA CANDIDATA: NO APLICAR SIN RESPALDO Y PRUEBAS REALES.
-- Protege recepciones OC y preserva movimientos independientes.
-- Revisar antes: otras funciones que editen received_quantity, grants heredados
-- y posibilidad de INSERT/DELETE de líneas desde flujos de edición de OC.
BEGIN;

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
     AND current_user NOT IN ('postgres') THEN
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

-- B) Impedir edición/borrado de movimientos vinculados a OC.
CREATE OR REPLACE FUNCTION public.guard_oc_stock_movement_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $guard$
BEGIN
  IF OLD.purchase_order_id IS NOT NULL OR OLD.purchase_order_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'Los movimientos vinculados a OC no se pueden editar ni eliminar directamente';
  END IF;
  RETURN OLD;
END;
$guard$;
DROP TRIGGER IF EXISTS guard_oc_stock_movement_mutation ON public.stock_movements;
CREATE TRIGGER guard_oc_stock_movement_mutation
BEFORE UPDATE OR DELETE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.guard_oc_stock_movement_mutation();

-- B2) Solo la RPC privilegiada puede crear vínculos formales de recepción.
-- purchase_order (texto) NO se usa para decidir: es una referencia libre
-- utilizada por registrar_entrada_compra y otras rutas independientes.
CREATE OR REPLACE FUNCTION public.guard_oc_stock_movement_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $guard$
BEGIN
  IF NEW.purchase_order_id IS NOT NULL OR NEW.purchase_order_item_id IS NOT NULL THEN
    IF current_user <> 'postgres' THEN
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

-- Evitar que UPDATE transforme un movimiento independiente en vinculado a OC.
CREATE OR REPLACE FUNCTION public.guard_oc_stock_movement_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $guard$
BEGIN
  IF OLD.purchase_order_id IS NOT NULL OR OLD.purchase_order_item_id IS NOT NULL
     OR (TG_OP = 'UPDATE' AND
        (NEW.purchase_order_id IS NOT NULL OR NEW.purchase_order_item_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Los movimientos vinculados a OC no se pueden editar ni eliminar directamente';
  END IF;
  RETURN OLD;
END;
$guard$;

-- C) RPC autorizada, bajo el propietario de confianza postgres.
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
  IF v_order.id IS NULL OR v_order.status IN ('completa','anulada') THEN
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


-- D) Eliminar UPDATE general de roles cliente y habilitar solo columnas editables.
REVOKE UPDATE ON TABLE public.purchase_order_items FROM PUBLIC, anon, authenticated;
GRANT UPDATE (
  purchase_order_id, product_id, quantity, measure_unit,
  unit_cost, item_type, description, line_total
) ON TABLE public.purchase_order_items TO authenticated;
REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid,text,text,jsonb) TO authenticated;
-- Las funciones de trigger no necesitan EXECUTE concedido a clientes.
REVOKE ALL ON FUNCTION public.guard_purchase_order_item_receipts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_oc_stock_movement_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_oc_stock_movement_insert() FROM PUBLIC, anon, authenticated;
COMMIT;

-- BLOQUEADORES DE DESPLIEGUE:
-- 1. Verificar que current_user dentro de RPC sea postgres; si no, reemplazar
--    la comprobación por el propietario efectivo de confianza.
-- 2. Comprobar permisos de UPDATE heredados por PUBLIC y otros roles.
-- 3. Validar RLS de INSERT/DELETE de líneas y cambios de OC ya aprobada.
-- 4. Probar RPC con JWT real BODEGA, ADMIN, ADMINPRO y GERENCIA.
-- 5. Probar ediciones legítimas, recepción parcial/completa y triggers de stock.
-- 6. Revisar si otras funciones SECURITY DEFINER requieren modificar líneas.
-- 7. Probar que registrar_entrada_compra/editar_entrada_compra sigan funcionando
--    con purchase_order (texto) y sin IDs formales.
-- 8. Hacer respaldo antes de aplicar. No desplegar sin estas verificaciones.
