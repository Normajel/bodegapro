-- Prueba de integración transaccional: no deja productos, OC, recepciones ni planillas.
BEGIN;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',p.id,'role','authenticated','aal','aal2')::text,true)
FROM public.profiles p JOIN public.app_roles r ON r.id=p.role_id WHERE r.name='ADMIN' LIMIT 1;
SELECT set_config('test.special_user',auth.uid()::text,true);
SELECT set_config('test.supplier',(SELECT id::text FROM public.suppliers LIMIT 1),true);
SELECT set_config('test.normal',(SELECT id::text FROM public.products WHERE active LIMIT 1),true);
SELECT set_config('test.normal_stock',(SELECT stock::text FROM public.products WHERE id=current_setting('test.normal')::uuid),true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE sp uuid; po uuid; doc uuid=gen_random_uuid(); lid uuid=gen_random_uuid(); result jsonb; BEGIN
 IF NOT public.can_access_special_products() THEN RAISE EXCEPTION 'ADMIN sin acceso'; END IF;
 INSERT INTO public.special_products(name,category,unit,unit_cost) VALUES('TEST ESPECIAL TRANSACCIONAL','ESTRUCTURA','unidad',2500) RETURNING id INTO sp;
 PERFORM set_config('test.special',sp::text,true);
 IF NOT EXISTS(SELECT 1 FROM public.special_products WHERE id=sp AND sku ~ '^ESP[0-9]{6}$') THEN RAISE EXCEPTION 'SKU incorrecto'; END IF;
 po:=public.save_purchase_order(current_setting('test.supplier')::uuid,'TEST',jsonb_build_array(
 jsonb_build_object('item_type','producto','special_product_id',sp,'description','TEST ESPECIAL','quantity',3,'measure_unit','unidad','unit_cost',2500),
 jsonb_build_object('item_type','producto','product_id',current_setting('test.normal'),'description','TEST NORMAL','quantity',4,'measure_unit','unidad','unit_cost',100)));
 PERFORM set_config('test.order',po::text,true);
 PERFORM public.approve_purchase_order(po);
 PERFORM public.save_special_cubication(doc,'TEST-ESP-UNIT','{"client":"TEST","salesOrderNumber":"TEST"}',jsonb_build_array(jsonb_build_object('line_id',lid,'special_product_id',sp,'quantity',2,'unit_cost',2500)),true,jsonb_build_array(jsonb_build_object('product_id',current_setting('test.normal'),'quantity',1)));
 PERFORM public.save_special_cubication(doc,'TEST-ESP-UNIT','{"client":"TEST","salesOrderNumber":"TEST"}',jsonb_build_array(jsonb_build_object('line_id',lid,'special_product_id',sp,'quantity',2,'unit_cost',2500)));
 IF (SELECT count(*) FROM public.special_cubication_lines WHERE document_id=doc)<>1 OR (SELECT sum(quantity) FROM public.special_cubication_lines WHERE document_id=doc)<>2 THEN RAISE EXCEPTION 'Uso duplicado'; END IF;
 IF (SELECT count(*) FROM public.cubication_special_items WHERE template_id=(SELECT id FROM public.cubication_templates WHERE unit_code='TEST-ESP-UNIT'))<>1 THEN RAISE EXCEPTION 'Especial no guardado en plantilla'; END IF;
 -- Costo inválido y cantidades fraccionadas deben rechazarse sin modificar el documento.
 BEGIN
  PERFORM public.save_special_cubication(doc,'TEST-ESP-UNIT','{}',jsonb_build_array(jsonb_build_object('line_id',lid,'special_product_id',sp,'quantity',1.5,'unit_cost',2500)));
  RAISE EXCEPTION 'Aceptó cantidad fraccionada';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',p.id,'role','authenticated','aal','aal1')::text,true)
FROM public.profiles p JOIN public.app_roles r ON r.id=p.role_id WHERE r.name='BODEGA' LIMIT 1;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF public.can_access_special_products() OR EXISTS(SELECT 1 FROM public.special_products) THEN RAISE EXCEPTION 'Bodega accedió al catálogo especial'; END IF;
 BEGIN
  PERFORM public.get_special_product_history(current_setting('test.special')::uuid);
  RAISE EXCEPTION 'Bodega accedió al historial';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='Bodega accedió al historial' THEN RAISE; END IF; END;
 PERFORM public.receive_purchase_order(current_setting('test.order')::uuid,'factura','TEST-ESPECIAL',(
 SELECT jsonb_agg(jsonb_build_object('item_id',id,'quantity',CASE WHEN special_product_id IS NOT NULL THEN 1 ELSE 4 END))
 FROM public.purchase_order_items WHERE purchase_order_id=current_setting('test.order')::uuid));
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.special_user'),'role','authenticated','aal','aal2')::text,true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE history jsonb; BEGIN
 IF (SELECT status FROM public.purchase_orders WHERE id=current_setting('test.order')::uuid)<>'parcial' THEN RAISE EXCEPTION 'Recepción parcial incorrecta'; END IF;
 PERFORM public.receive_purchase_order(current_setting('test.order')::uuid,'guia_despacho','TEST-ESPECIAL-2',(
 SELECT jsonb_agg(jsonb_build_object('item_id',id,'quantity',2)) FROM public.purchase_order_items WHERE purchase_order_id=current_setting('test.order')::uuid AND special_product_id IS NOT NULL));
 history:=public.get_special_product_history(current_setting('test.special')::uuid);
 IF jsonb_array_length(history->'purchases')<>2 THEN RAISE EXCEPTION 'Historial de recepción incompleto'; END IF;
 IF (SELECT sum((x->>'total_cost')::numeric) FROM jsonb_array_elements(history->'purchases') x)<>7500 THEN RAISE EXCEPTION 'Costo total incorrecto'; END IF;
 IF (SELECT sum((x->>'quantity')::numeric) FROM jsonb_array_elements(history->'usage') x)<>2 THEN RAISE EXCEPTION 'Uso duplicado en historial'; END IF;
 IF (SELECT status FROM public.purchase_orders WHERE id=current_setting('test.order')::uuid)<>'completa' THEN RAISE EXCEPTION 'Recepción completa incorrecta'; END IF;
 IF (SELECT stock FROM public.products WHERE id=current_setting('test.normal')::uuid)<>current_setting('test.normal_stock')::numeric+4 THEN RAISE EXCEPTION 'Stock general incorrecto'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',p.id,'role','authenticated','aal','aal1')::text,true)
FROM public.profiles p JOIN public.app_roles r ON r.id=p.role_id WHERE r.name='VENTA' LIMIT 1;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF NOT public.can_access_special_products() THEN RAISE EXCEPTION 'Ventas sin acceso'; END IF;
 IF (public.get_special_product_history(current_setting('test.special')::uuid)->'orders'->0->>'supplier_name') IS NULL THEN RAISE EXCEPTION 'Ventas sin historial proveedor'; END IF;
 INSERT INTO public.special_products(name,category,unit) VALUES('TEST VENTAS','PINTURA','unidad');
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',p.id,'role','authenticated','aal','aal1')::text,true)
FROM public.profiles p JOIN public.app_roles r ON r.id=p.role_id WHERE r.name='GERENCIA' LIMIT 1;
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF public.can_access_special_products() OR EXISTS(SELECT 1 FROM public.special_products) THEN RAISE EXCEPTION 'Gerencia accedió al catálogo especial'; END IF; END $$;
RESET ROLE;
SELECT 'PASS: SKU ESP, permisos Admin/Ventas/Bodega/Gerencia, OC mixta, recepción parcial/completa, costos, proveedor, planilla e idempotencia' AS result;
ROLLBACK;
