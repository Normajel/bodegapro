CREATE OR REPLACE FUNCTION public.save_movement_batch(payload jsonb, edit_batch uuid DEFAULT NULL, edit_id uuid DEFAULT NULL) RETURNS SETOF public.stock_movements LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE item jsonb; bid uuid; mid uuid; ids uuid[] := '{}'; movement_kind public.movement_type;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión'; END IF;
 IF jsonb_array_length(payload->'lines')<1 THEN RAISE EXCEPTION 'Agrega al menos un producto'; END IF;
 movement_kind:=(payload->>'type')::public.movement_type;
 bid:=coalesce(edit_batch,gen_random_uuid());
 PERFORM id FROM public.products WHERE id IN (SELECT (value->>'product_id')::uuid FROM jsonb_array_elements(payload->'lines')) OR id IN (SELECT product_id FROM public.stock_movements WHERE batch_id=edit_batch OR id=edit_id) ORDER BY id FOR UPDATE;
 FOR item IN SELECT value FROM jsonb_array_elements(payload->'lines') LOOP
 mid:=nullif(item->>'id','')::uuid;
 IF mid IS NOT NULL THEN
 IF NOT EXISTS(SELECT 1 FROM public.stock_movements WHERE id=mid AND (batch_id=edit_batch OR id=edit_id) AND type=movement_kind) THEN RAISE EXCEPTION 'Movimiento inválido'; END IF;
 UPDATE public.stock_movements SET product_id=(item->>'product_id')::uuid,quantity_value=(item->>'quantity')::numeric,quantity=greatest(1,round((item->>'quantity')::numeric)::integer),measure_unit=item->>'measure_unit',unit_cost=(item->>'unit_cost')::numeric,supplier_id=nullif(payload->>'supplier_id','')::uuid,reference=nullif(payload->>'reference',''),notes=nullif(payload->>'notes',''),unit_type=nullif(payload->>'unit_type',''),unit_type_value=nullif(payload->>'unit_type_value',''),purchase_order=nullif(payload->>'purchase_order',''),document_type=nullif(payload->>'document_type',''),document_number=nullif(payload->>'document_number','') WHERE id=mid;
 ELSE
 INSERT INTO public.stock_movements(product_id,type,quantity,quantity_value,measure_unit,unit_cost,supplier_id,reference,notes,unit_type,unit_type_value,purchase_order,document_type,document_number,batch_id,created_by) VALUES ((item->>'product_id')::uuid,movement_kind,greatest(1,round((item->>'quantity')::numeric)::integer),(item->>'quantity')::numeric,item->>'measure_unit',(item->>'unit_cost')::numeric,nullif(payload->>'supplier_id','')::uuid,nullif(payload->>'reference',''),nullif(payload->>'notes',''),nullif(payload->>'unit_type',''),nullif(payload->>'unit_type_value',''),nullif(payload->>'purchase_order',''),nullif(payload->>'document_type',''),nullif(payload->>'document_number',''),bid,auth.uid()) RETURNING id INTO mid;
 END IF;
 ids:=array_append(ids,mid);
 END LOOP;
 IF edit_batch IS NOT NULL OR edit_id IS NOT NULL THEN DELETE FROM public.stock_movements WHERE (batch_id=edit_batch OR id=edit_id) AND NOT(id=ANY(ids)); END IF;
 RETURN QUERY SELECT * FROM public.stock_movements WHERE id=ANY(ids) ORDER BY created_at,id;
END $$;
REVOKE ALL ON FUNCTION public.save_movement_batch(jsonb,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_movement_batch(jsonb,uuid,uuid) TO authenticated;
