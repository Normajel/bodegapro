-- PROPUESTA PARA REVISIÓN / NO EJECUTAR EN PRODUCCIÓN.
-- Dependencia: public.receive_purchase_order(uuid,text,text,jsonb) existente.
-- Objetivo: permitir recepción a BODEGA sin purchases.edit.
-- Función interna solo como referencia de diseño; sin permisos EXECUTE ni endpoint público.
-- Requiere pruebas con roles reales y revisión de triggers antes de desplegar.

CREATE OR REPLACE FUNCTION private.receive_purchase_order_authorized_internal(
  p_order_id uuid, p_document_type text, p_document_number text, p_lines jsonb
)
RETURNS SETOF public.stock_movements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;

  SELECT upper(trim(r.name)) INTO v_role
  FROM public.profiles AS p
  JOIN public.app_roles AS r ON r.id = p.role_id
  WHERE p.id = auth.uid();

  IF v_role IS NULL OR v_role NOT IN ('BODEGA','ADMIN','ADMINPRO') THEN
    RAISE EXCEPTION 'Perfil no autorizado para recepcionar órdenes de compra';
  END IF;
  IF v_role = 'BODEGA'
     AND NOT (
       public.has_app_permission('purchases','view')
       AND public.has_app_permission('movements','create')
     ) THEN
    RAISE EXCEPTION 'Permisos insuficientes para recepción';
  END IF;
  IF v_role IN ('ADMIN','ADMINPRO')
     AND NOT public.has_app_permission('purchases','edit') THEN
    RAISE EXCEPTION 'Permisos de administrador insuficientes';
  END IF;

  -- Validar antes de entrar al procedimiento privilegiado.
  IF coalesce(jsonb_typeof(p_lines),'null') <> 'array' THEN
    RAISE EXCEPTION 'La recepción debe contener una lista de líneas';
  END IF;
  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'La recepción no puede estar vacía';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) AS x(value)
    WHERE jsonb_typeof(x.value) <> 'object'
      OR coalesce(jsonb_typeof(x.value->'quantity'),'null') <> 'number'
      OR coalesce(x.value->>'item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'Cada línea requiere item_id UUID y quantity numérica';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) AS x(value)
    GROUP BY x.value->>'item_id' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'No se permiten líneas repetidas';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) AS x(value)
    WHERE (x.value->>'quantity')::numeric < 0
       OR (x.value->>'quantity')::numeric <> trunc((x.value->>'quantity')::numeric)
  ) THEN
    RAISE EXCEPTION 'Las cantidades deben ser enteras no negativas';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) AS x(value)
    WHERE (x.value->>'quantity')::numeric > 0
  ) THEN
    RAISE EXCEPTION 'Debes recepcionar al menos una unidad';
  END IF;

  -- El procedimiento actual realiza bloqueos de filas, validación de OC aprobada,
  -- control de cantidades pendientes y actualizaciones de stock/OC.
  RETURN QUERY SELECT * FROM public.receive_purchase_order(
    p_order_id, p_document_type, p_document_number, p_lines
  );
END;
$$;

-- NO CREAR WRAPPER NI GRANT EN ESTA ETAPA.
-- Para evitar exposición directa de una función SECURITY DEFINER,
-- integrar la lógica autorizada en una RPC pública única con control de
-- auth.uid(), perfil y permisos; su implementación deberá probarse en staging.
-- No conceder EXECUTE de una función privilegiada interna a authenticated.
-- Mantener el esquema private fuera de los esquemas expuestos por Data API.
-- Antes de activar: revisar propietario, permisos por defecto y los triggers
-- que actualizan stock, además de los consumidores de la RPC original.

-- ANTES DE ACTIVAR: retirar EXECUTE de la RPC antigua para roles cliente
-- únicamente después de actualizar y probar TODOS sus consumidores.
-- No revocar aquí: podría romper el frontend actual.
