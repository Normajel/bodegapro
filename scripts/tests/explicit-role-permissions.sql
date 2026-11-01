-- Run on an authorized test database with the application schema and role accounts.
-- Every fixture and test stock movement is rolled back. Role configuration is not changed here.
BEGIN;
CREATE TEMP TABLE role_permission_fixture AS
 SELECT gen_random_uuid() AS order_id,gen_random_uuid() AS item_id,
 (SELECT id FROM public.products WHERE active=true LIMIT 1) AS product_id,
 (SELECT id FROM public.suppliers WHERE supplier_kind IN ('productos','ambos') LIMIT 1) AS supplier_id,
 (SELECT p.id FROM public.profiles p JOIN public.app_roles r ON r.id=p.role_id WHERE r.name='GERENCIA' LIMIT 1) AS gerencia_id,
 (SELECT p.id FROM public.profiles p JOIN public.app_roles r ON r.id=p.role_id WHERE r.name='BODEGA' LIMIT 1) AS bodega_id,
 (SELECT p.id FROM public.profiles p JOIN public.app_roles r ON r.id=p.role_id WHERE r.name='ADMIN' LIMIT 1) AS admin_id;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM role_permission_fixture WHERE product_id IS NULL OR supplier_id IS NULL OR gerencia_id IS NULL OR bodega_id IS NULL OR admin_id IS NULL) THEN RAISE EXCEPTION 'The test requires a product, supplier and existing role accounts'; END IF;
END $$;
GRANT SELECT ON role_permission_fixture TO authenticated;
CREATE TEMP TABLE role_permission_original_stock AS SELECT stock FROM public.products WHERE id=(SELECT product_id FROM role_permission_fixture);
GRANT SELECT ON role_permission_original_stock TO authenticated;
INSERT INTO public.purchase_orders(id,order_number,supplier_id)
 SELECT order_id,'TEST-ROLE-PERMISSIONS-'||order_id::text,supplier_id FROM role_permission_fixture;
INSERT INTO public.purchase_order_items(id,purchase_order_id,product_id,description,item_type,quantity,measure_unit,unit_cost)
 SELECT f.item_id,f.order_id,f.product_id,'Test permission fixture','producto',2,p.unit,50 FROM role_permission_fixture f JOIN public.products p ON p.id=f.product_id;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',gerencia_id,'role','authenticated','aal','aal1')::text,true) FROM role_permission_fixture;
DO $tests$
DECLARE cmd text;
BEGIN
 IF public.has_app_permission('purchases','view') IS NOT TRUE OR public.has_app_permission('movements','view') IS NOT TRUE THEN RAISE EXCEPTION 'Gerencia lost viewing permissions'; END IF;
 IF public.can_approve_purchase_orders() IS NOT TRUE THEN RAISE EXCEPTION 'Gerencia cannot approve'; END IF;
 IF public.has_app_permission('missing','missing') IS DISTINCT FROM false OR public.has_app_permission(NULL,NULL) IS DISTINCT FROM false THEN RAISE EXCEPTION 'Missing permissions must be false'; END IF;
 FOREACH cmd IN ARRAY ARRAY[
 'SELECT public.registrar_entrada_compra(NULL,NULL,''factura'',''TEST'',NULL,''[]''::jsonb)',
 'SELECT public.editar_entrada_compra(NULL,NULL,NULL,''factura'',''TEST'',NULL,''[]''::jsonb)',
 'SELECT public.editar_entrada_documento(ARRAY[]::uuid[],''{}''::jsonb)',
 'SELECT public.editar_salida_documento(ARRAY[]::uuid[],''{}''::jsonb)',
 'SELECT public.anular_compra(NULL,NULL)',
 'SELECT public.anular_entrada_documento(ARRAY[]::uuid[],NULL)',
 'SELECT public.anular_salida_documento(ARRAY[]::uuid[],NULL)',
 'SELECT public.archive_product(NULL)',
 'SELECT public.save_cubication_template(''TEST'',''[]''::jsonb)'
 ] LOOP
   BEGIN EXECUTE cmd; RAISE EXCEPTION 'Unexpected permission grant: %',cmd;
   EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'No tienes permiso%' THEN RAISE; END IF; END;
 END LOOP;
 BEGIN PERFORM public.begin_purchase_order_email((SELECT order_id FROM role_permission_fixture),gen_random_uuid());RAISE EXCEPTION 'Gerencia unexpectedly sent email';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'No tienes permiso%' THEN RAISE; END IF; END;
END $tests$;
SELECT public.approve_purchase_order(order_id) FROM role_permission_fixture;
DO $$ BEGIN
 IF (SELECT approval_status FROM public.purchase_orders WHERE id=(SELECT order_id FROM role_permission_fixture))<>'aprobada' THEN RAISE EXCEPTION 'Gerencia approval failed'; END IF;
 BEGIN PERFORM public.receive_purchase_order((SELECT order_id FROM role_permission_fixture),'factura','TEST-ROLE','[]'::jsonb);RAISE EXCEPTION 'Gerencia unexpectedly received';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'No tienes permiso%' THEN RAISE; END IF; END;
END $$;

SELECT set_config('request.jwt.claims',jsonb_build_object('sub',bodega_id,'role','authenticated','aal','aal1')::text,true) FROM role_permission_fixture;
DO $tests$
DECLARE cmd text; row_count integer;
BEGIN
 IF public.has_app_permission('purchases','view') IS NOT TRUE OR public.has_app_permission('movements','create') IS NOT TRUE THEN RAISE EXCEPTION 'Bodega lost receiving prerequisites'; END IF;
 IF public.can_approve_purchase_orders() IS DISTINCT FROM false THEN RAISE EXCEPTION 'Bodega can approve'; END IF;
 FOREACH cmd IN ARRAY ARRAY[
 'SELECT public.registrar_entrada_compra(NULL,NULL,''factura'',''TEST'',NULL,''[]''::jsonb)',
 'SELECT public.editar_entrada_compra(NULL,NULL,NULL,''factura'',''TEST'',NULL,''[]''::jsonb)',
 'SELECT public.editar_entrada_documento(ARRAY[]::uuid[],''{}''::jsonb)',
 'SELECT public.editar_salida_documento(ARRAY[]::uuid[],''{}''::jsonb)',
 'SELECT public.anular_compra(NULL,NULL)',
 'SELECT public.anular_entrada_documento(ARRAY[]::uuid[],NULL)',
 'SELECT public.anular_salida_documento(ARRAY[]::uuid[],NULL)',
 'SELECT public.archive_product(NULL)',
 'SELECT public.save_cubication_template(''TEST'',''[]''::jsonb)'
 ] LOOP
   BEGIN EXECUTE cmd; RAISE EXCEPTION 'Unexpected permission grant: %',cmd;
   EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'No tienes permiso%' THEN RAISE; END IF; END;
 END LOOP;
 UPDATE public.products SET name='TEST-MUST-NOT-CHANGE' WHERE id=(SELECT product_id FROM role_permission_fixture);
 GET DIAGNOSTICS row_count=ROW_COUNT; IF row_count<>0 THEN RAISE EXCEPTION 'Bodega directly edited inventory'; END IF;
 DELETE FROM public.products WHERE id=(SELECT product_id FROM role_permission_fixture);
 GET DIAGNOSTICS row_count=ROW_COUNT; IF row_count<>0 THEN RAISE EXCEPTION 'Bodega deleted inventory'; END IF;
 BEGIN
   INSERT INTO public.stock_movements(product_id,type,quantity,created_by)
     SELECT product_id,'entrada',1,auth.uid() FROM role_permission_fixture;
   RAISE EXCEPTION 'Direct entry without OC accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $tests$;
SELECT count(*) FROM public.receive_purchase_order((SELECT order_id FROM role_permission_fixture),'guia_despacho','TEST-ROLE-PARTIAL',(SELECT jsonb_build_array(jsonb_build_object('item_id',item_id,'quantity',1)) FROM role_permission_fixture));
DO $$ DECLARE row_count integer;
BEGIN
 IF (SELECT status FROM public.purchase_orders WHERE id=(SELECT order_id FROM role_permission_fixture))<>'parcial' THEN RAISE EXCEPTION 'Partial receipt failed'; END IF;
 UPDATE public.stock_movements SET notes='TEST-MUST-NOT-CHANGE' WHERE purchase_order_id=(SELECT order_id FROM role_permission_fixture);
 GET DIAGNOSTICS row_count=ROW_COUNT; IF row_count<>0 THEN RAISE EXCEPTION 'Bodega edited an existing movement'; END IF;
 DELETE FROM public.stock_movements WHERE purchase_order_id=(SELECT order_id FROM role_permission_fixture);
 GET DIAGNOSTICS row_count=ROW_COUNT; IF row_count<>0 THEN RAISE EXCEPTION 'Bodega deleted an existing movement'; END IF;
END $$;
SELECT count(*) FROM public.receive_purchase_order((SELECT order_id FROM role_permission_fixture),'factura','TEST-ROLE-COMPLETE',(SELECT jsonb_build_array(jsonb_build_object('item_id',item_id,'quantity',1)) FROM role_permission_fixture));
DO $$ BEGIN
 IF (SELECT status FROM public.purchase_orders WHERE id=(SELECT order_id FROM role_permission_fixture))<>'completa' THEN RAISE EXCEPTION 'Complete receipt failed'; END IF;
 IF (SELECT stock FROM public.products WHERE id=(SELECT product_id FROM role_permission_fixture))<>(SELECT stock+2 FROM role_permission_original_stock) THEN RAISE EXCEPTION 'Receiving stock changed incorrectly'; END IF;
END $$;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal1')::text,true) FROM role_permission_fixture;
DO $$ BEGIN IF public.can_approve_purchase_orders() IS DISTINCT FROM false THEN RAISE EXCEPTION 'Admin approval bypassed MFA'; END IF; END $$;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2')::text,true) FROM role_permission_fixture;
DO $$ BEGIN IF public.can_approve_purchase_orders() IS NOT TRUE OR public.has_app_permission('purchases','edit') IS NOT TRUE THEN RAISE EXCEPTION 'Admin with MFA lost permission'; END IF; END $$;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated','aal','aal1')::text,true);
DO $$ BEGIN IF public.has_app_permission('purchases','view') IS DISTINCT FROM false THEN RAISE EXCEPTION 'Missing profile must be denied'; END IF; END $$;
ROLLBACK;
SELECT 'PASS: explicit role matrix, denied RPCs, RLS, Gerencia approval, Bodega partial/complete receiving, no direct incoming stock and admin MFA; fixtures rolled back' AS test_result;
