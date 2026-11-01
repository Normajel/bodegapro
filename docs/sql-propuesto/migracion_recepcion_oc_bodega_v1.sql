-- MIGRACIÓN CANDIDATA / NO APLICADA. Reemplaza la RPC existente de forma atómica.
-- Requiere pruebas con perfiles reales y revisión de triggers antes de desplegar.
-- No crea funciones internas ejecutables por usuarios.
BEGIN;

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

REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid,text,text,jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid,text,text,jsonb) TO authenticated;
COMMIT;

-- PRUEBAS OBLIGATORIAS ANTES DE APLICAR:
-- 1) Validar triggers require_approved_purchase_order_receipt,
--    actualizar_stock_movimiento y guard_purchase_order_approval.
-- 2) Probar con JWT real BODEGA / ADMIN / ADMINPRO / GERENCIA.
-- 3) Comprobar permisos para leer perfiles y funciones de permisos.
-- 4) Confirmar recepción parcial/completa, inventario y documentos.
-- 5) Auditar protección de UPDATE directo sobre received_quantity y movimientos OC.
-- 6) Revisar dependencias de funciones y otras rutas de entrada.
