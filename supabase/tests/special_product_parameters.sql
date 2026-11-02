-- Pruebas de autorización y validación; no deja datos.
BEGIN;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',p.id,'role','authenticated','aal','aal2')::text,true)
FROM public.profiles p JOIN public.app_roles r ON r.id=p.role_id WHERE r.name='ADMIN' LIMIT 1;
SET LOCAL ROLE authenticated;
DO $$ DECLARE v_id uuid; BEGIN
 IF NOT public.can_manage_special_product_parameters() THEN RAISE EXCEPTION 'Admin sin acceso a parámetros'; END IF;
 INSERT INTO public.special_product_parameters(kind,label) VALUES('category','TEST-PARAM-CATEGORY') RETURNING id INTO v_id;
 UPDATE public.special_product_parameters SET label='TEST-PARAM-RENAMED' WHERE id=v_id;
 IF NOT EXISTS(SELECT 1 FROM public.special_product_parameters WHERE id=v_id AND label='TEST-PARAM-RENAMED') THEN RAISE EXCEPTION 'Admin no pudo modificar categoría'; END IF;
 PERFORM set_config('test.parameter_id',v_id::text,true);
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',p.id,'role','authenticated','aal','aal1')::text,true)
FROM public.profiles p JOIN public.app_roles r ON r.id=p.role_id WHERE r.name='VENTA' LIMIT 1;
SET LOCAL ROLE authenticated;
DO $$ DECLARE n integer; BEGIN
 IF public.can_manage_special_product_parameters() THEN RAISE EXCEPTION 'Ventas puede administrar parámetros'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.special_product_parameters WHERE id=current_setting('test.parameter_id')::uuid AND label='TEST-PARAM-RENAMED') THEN RAISE EXCEPTION 'Ventas no puede ver opción de Admin'; END IF;
 UPDATE public.special_product_parameters SET label='TEST-UNAUTHORIZED' WHERE id=current_setting('test.parameter_id')::uuid;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Ventas pudo modificar parámetro'; END IF;
 BEGIN
  INSERT INTO public.special_product_parameters(kind,label) VALUES('unit','TEST-UNAUTHORIZED');
  RAISE EXCEPTION 'Ventas pudo agregar parámetro';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO public.special_products(name,category,unit) VALUES('TEST PARAM PRODUCT','TEST-PARAM-RENAMED','unidad');
 BEGIN
  INSERT INTO public.special_products(name,category,unit) VALUES('TEST INVALID PARAM','CATEGORIA-INEXISTENTE','unidad');
  RAISE EXCEPTION 'Aceptó categoría inexistente';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Aceptó categoría inexistente' THEN RAISE; END IF;
 END;
 BEGIN
  INSERT INTO public.special_products(name,category,unit) VALUES('TEST INVALID UNIT','ESTRUCTURA','UNIDAD-INEXISTENTE');
  RAISE EXCEPTION 'Aceptó unidad inexistente';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Aceptó unidad inexistente' THEN RAISE; END IF;
 END;
END $$;
RESET ROLE;
SELECT 'PASS: Admin administra, Ventas selecciona pero no modifica opciones y no puede usar parámetros inexistentes' result;
ROLLBACK;
