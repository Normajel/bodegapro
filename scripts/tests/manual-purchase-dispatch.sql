BEGIN;
DO $$
DECLARE admin_id uuid; bodega_id uuid; order_id uuid; request_id uuid:=gen_random_uuid(); second_id uuid:=gen_random_uuid();
        first_date timestamptz:=now()-interval '2 minutes'; result uuid; event_count integer;
BEGIN
 SELECT p.id INTO admin_id FROM public.profiles p JOIN public.app_roles r ON r.id=p.role_id WHERE r.name='ADMIN' LIMIT 1;
 SELECT p.id INTO bodega_id FROM public.profiles p JOIN public.app_roles r ON r.id=p.role_id WHERE r.name='BODEGA' LIMIT 1;
 SELECT id INTO order_id FROM public.purchase_orders WHERE approval_status='aprobada' AND status IN ('pendiente','parcial') AND sent_at IS NULL AND approved_at<now()-interval '5 minutes' AND NOT EXISTS(SELECT 1 FROM public.purchase_order_email_events WHERE purchase_order_id=purchase_orders.id AND status IN ('processing','unknown')) LIMIT 1;
 IF admin_id IS NULL OR bodega_id IS NULL OR order_id IS NULL THEN RAISE EXCEPTION 'Missing test profiles or approved unsent OC'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2')::text,true);
 result:=public.record_manual_purchase_dispatch(order_id,request_id,first_date,'Contacto QA','correo_externo','Solo verificación con rollback',7);
 IF result<>request_id OR (SELECT sent_at FROM public.purchase_orders WHERE id=order_id) IS DISTINCT FROM first_date THEN RAISE EXCEPTION 'First manual send was not recorded'; END IF;
 IF (SELECT due_date FROM public.purchase_delivery_summary WHERE id=order_id) IS DISTINCT FROM (first_date AT TIME ZONE 'America/Santiago')::date+7 THEN RAISE EXCEPTION 'Deadline was not activated'; END IF;
 PERFORM public.record_manual_purchase_dispatch(order_id,request_id,first_date,'Contacto QA','correo_externo','Solo verificación con rollback',7);
 SELECT count(*) INTO event_count FROM public.purchase_order_email_events WHERE id=request_id;
 IF event_count<>1 THEN RAISE EXCEPTION 'Retry duplicated audit event'; END IF;
 PERFORM public.record_manual_purchase_dispatch(order_id,second_id,now()-interval '1 minute','Contacto QA','whatsapp','Reenvío',7);
 IF (SELECT sent_at FROM public.purchase_orders WHERE id=order_id) IS DISTINCT FROM first_date THEN RAISE EXCEPTION 'Resend reset deadline'; END IF;
 IF EXISTS(SELECT 1 FROM public.purchase_order_email_events WHERE id IN (request_id,second_id) AND (status<>'manual' OR provider_id IS NOT NULL OR created_by<>admin_id)) THEN RAISE EXCEPTION 'Manual send misrepresented email success or author'; END IF;
 BEGIN
   PERFORM public.record_manual_purchase_dispatch(order_id,gen_random_uuid(),now()+interval '1 day','QA','otro','',7);
   RAISE EXCEPTION 'Future date allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='Future date allowed' THEN RAISE; END IF; END;
 BEGIN
   UPDATE public.purchase_orders SET sent_at=now() WHERE id=order_id;
   RAISE EXCEPTION 'Direct timestamp edit allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='Direct timestamp edit allowed' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',bodega_id,'role','authenticated','aal','aal1')::text,true);
 BEGIN
   PERFORM public.record_manual_purchase_dispatch(order_id,gen_random_uuid(),now(),'QA','otro','',7);
   RAISE EXCEPTION 'Bodega was allowed to register sending';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF has_function_privilege('anon','public.record_manual_purchase_dispatch(uuid,uuid,timestamptz,text,text,text,integer)','EXECUTE') OR has_table_privilege('authenticated','public.purchase_order_email_events','INSERT') THEN RAISE EXCEPTION 'Unexpected audit-write privileges'; END IF;
END $$;
SELECT 'passed: first manual send, deadline, audit author, idempotency, resend, future date, direct edit, role authorization and grants' AS result;
ROLLBACK;
