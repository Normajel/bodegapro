-- Parche controlado: permitir ingresos independientes al perfil BODEGA.
-- Aplicar SOLO en BodegaPro-Pruebas después de revisar el archivo.
-- No cambia permisos de roles, políticas RLS ni funciones de órdenes de compra.

BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_entrada_compra(
  p_supplier_id uuid,
  p_purchase_order text,
  p_document_type text,
  p_document_number text,
  p_notes text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_entry_id uuid;
  v_movement_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_unit text;
  v_unit_price numeric;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para registrar una compra';
  END IF;

  -- BODEGA registra entradas independientes mediante movements.create.
  -- Otros perfiles autorizados pueden conservar purchases.create.
  IF NOT (
    public.has_app_permission('movements', 'create')
    OR public.has_app_permission('purchases', 'create')
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para registrar entradas de inventario';
  END IF;

  IF p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Selecciona un proveedor';
  END IF;

  IF p_document_type IS NULL
     OR p_document_type NOT IN ('factura', 'guia_despacho') THEN
    RAISE EXCEPTION 'Selecciona Factura o Guía de despacho';
  END IF;

  IF coalesce(trim(p_document_number), '') = '' THEN
    RAISE EXCEPTION 'El número del documento es obligatorio';
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Agrega al menos un producto';
  END IF;

  INSERT INTO public.purchase_entries (
    supplier_id, purchase_order, document_type, document_number, notes, created_by
  )
  VALUES (
    p_supplier_id,
    nullif(trim(p_purchase_order), ''),
    p_document_type,
    trim(p_document_number),
    nullif(trim(p_notes), ''),
    v_user_id
  )
  RETURNING id INTO v_entry_id;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_quantity := nullif(v_item->>'quantity', '')::numeric;
    v_unit := trim(coalesce(v_item->>'unit', ''));
    v_unit_price := nullif(v_item->>'unit_price', '')::numeric;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Selecciona un producto válido';
    END IF;

    IF v_quantity IS NULL OR v_quantity <= 0 OR v_quantity <> trunc(v_quantity) THEN
      RAISE EXCEPTION 'La cantidad debe ser un número entero mayor que cero';
    END IF;

    IF v_unit = '' THEN
      RAISE EXCEPTION 'La unidad de medida es obligatoria';
    END IF;

    IF v_unit_price IS NULL OR v_unit_price < 0 THEN
      RAISE EXCEPTION 'El precio unitario debe ser cero o mayor';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.products p WHERE p.id = v_product_id
    ) THEN
      RAISE EXCEPTION 'Uno de los productos seleccionados no existe';
    END IF;

    INSERT INTO public.stock_movements (
      product_id, type, quantity, supplier_id, customer_id,
      unit_type, reference, notes, created_by
    )
    VALUES (
      v_product_id, 'entrada', v_quantity, p_supplier_id, NULL,
      NULL, NULL, nullif(trim(p_notes), ''), v_user_id
    )
    RETURNING id INTO v_movement_id;

    INSERT INTO public.purchase_entry_items (
      purchase_entry_id, stock_movement_id, product_id, quantity, unit, unit_price
    )
    VALUES (
      v_entry_id, v_movement_id, v_product_id, v_quantity, v_unit, v_unit_price
    );
  END LOOP;

  RETURN v_entry_id;
END;
$function$;

COMMIT;