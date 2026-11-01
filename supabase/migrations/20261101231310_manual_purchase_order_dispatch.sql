ALTER TABLE public.purchase_order_email_events
  ADD COLUMN dispatch_method text,
  ADD COLUMN dispatch_notes text;
ALTER TABLE public.purchase_order_email_events DROP CONSTRAINT purchase_order_email_events_status_check;
ALTER TABLE public.purchase_order_email_events ADD CONSTRAINT purchase_order_email_events_status_check
 CHECK(status IN ('processing','sent','failed','unknown','manual'));
ALTER TABLE public.purchase_order_email_events ADD CONSTRAINT manual_dispatch_evidence_check
 CHECK(status<>'manual' OR (sent_at IS NOT NULL AND provider_id IS NULL
   AND dispatch_method IS NOT NULL AND dispatch_method IN ('correo_externo','whatsapp','presencial','otro')));

CREATE OR REPLACE FUNCTION public.record_manual_purchase_dispatch(
 p_order_id uuid, p_request_id uuid, p_sent_at timestamptz, p_recipient text,
 p_method text, p_notes text, p_delivery_days integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.purchase_orders%ROWTYPE; previous public.purchase_order_email_events%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR public.has_app_permission('purchases','view') IS NOT TRUE
    OR public.has_app_permission('purchases','edit') IS NOT TRUE
    OR public.has_app_permission('purchases','send') IS NOT TRUE THEN
   RAISE EXCEPTION 'No tienes permiso para registrar el envío de esta OC' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR p_sent_at IS NULL OR NOT isfinite(p_sent_at) OR p_sent_at>now()
   OR nullif(btrim(p_recipient),'') IS NULL OR length(p_recipient)>320
   OR p_method IS NULL OR p_method NOT IN ('correo_externo','whatsapp','presencial','otro')
   OR length(coalesce(p_notes,''))>2000 OR p_delivery_days IS NULL OR p_delivery_days NOT BETWEEN 0 AND 3650 THEN
   RAISE EXCEPTION 'Revisa fecha, destinatario, medio y plazo de entrega';
 END IF;
 SELECT * INTO o FROM public.purchase_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.approval_status<>'aprobada' OR o.status='anulada' THEN
   RAISE EXCEPTION 'Solo puedes registrar envíos de OC aprobadas y no anuladas';
 END IF;
 SELECT * INTO previous FROM public.purchase_order_email_events WHERE id=p_request_id;
 IF FOUND THEN
   IF previous.purchase_order_id=p_order_id AND previous.status='manual' AND previous.created_by=auth.uid()
      AND previous.sent_at=p_sent_at AND previous.recipient=btrim(p_recipient)
      AND p_delivery_days IS NOT DISTINCT FROM o.delivery_days AND previous.dispatch_method=p_method AND previous.dispatch_notes IS NOT DISTINCT FROM nullif(btrim(p_notes),'') THEN
     RETURN previous.id;
   END IF;
   RAISE EXCEPTION 'La solicitud de envío ya se utilizó para otro registro';
 END IF;
 IF p_sent_at<date_trunc('minute',coalesce(o.approved_at,o.created_at))
    OR (o.sent_at IS NOT NULL AND p_sent_at<o.sent_at)
    OR (o.completed_at IS NOT NULL AND p_sent_at>o.completed_at) THEN
   RAISE EXCEPTION 'La fecha debe ser posterior a la aprobación y al primer envío, y anterior a la recepción completa';
 END IF;
 IF o.sent_at IS NOT NULL AND p_delivery_days IS DISTINCT FROM o.delivery_days THEN
   RAISE EXCEPTION 'Un reenvío no puede modificar el plazo original';
 END IF;
 IF EXISTS(SELECT 1 FROM public.purchase_order_email_events WHERE purchase_order_id=o.id AND status IN ('processing','unknown')) THEN
   RAISE EXCEPTION 'Hay un envío por correo en curso o por verificar. Revisa su historial antes del registro manual';
 END IF;
 INSERT INTO public.purchase_order_email_events(id,purchase_order_id,recipient,subject,created_by,sent_at,status,dispatch_method,dispatch_notes)
 VALUES(p_request_id,o.id,btrim(p_recipient),'Registro manual de envío · '||o.order_number,auth.uid(),p_sent_at,'manual',p_method,nullif(btrim(p_notes),''));
 UPDATE public.purchase_orders SET sent_at=coalesce(sent_at,p_sent_at),sent_to=coalesce(sent_to,btrim(p_recipient)),
   delivery_days=CASE WHEN sent_at IS NULL THEN p_delivery_days ELSE delivery_days END,updated_at=now() WHERE id=o.id;
 RETURN p_request_id;
END $$;
REVOKE ALL ON FUNCTION public.record_manual_purchase_dispatch(uuid,uuid,timestamptz,text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_manual_purchase_dispatch(uuid,uuid,timestamptz,text,text,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION private.guard_order_delivery()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_OP='INSERT' THEN
   NEW.delivery_days := (SELECT delivery_days FROM public.suppliers WHERE id=NEW.supplier_id);
   NEW.sent_at:=NULL; NEW.sent_to:=NULL; NEW.completed_at:=NULL;
 ELSE
   IF OLD.approval_status='aprobada' AND (
     NEW.supplier_id IS DISTINCT FROM OLD.supplier_id OR NEW.approval_status IS DISTINCT FROM OLD.approval_status
     OR NEW.order_date IS DISTINCT FROM OLD.order_date OR NEW.payment_terms IS DISTINCT FROM OLD.payment_terms
     OR NEW.payment_terms_other IS DISTINCT FROM OLD.payment_terms_other OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.description IS DISTINCT FROM OLD.description OR NEW.vat_rate IS DISTINCT FROM OLD.vat_rate
     OR NEW.order_number IS DISTINCT FROM OLD.order_number
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.net_total IS DISTINCT FROM OLD.net_total
     OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount OR NEW.total_amount IS DISTINCT FROM OLD.total_amount) THEN
     RAISE EXCEPTION 'La OC aprobada conserva su contenido. Anula y crea otra para cambiar lo contratado';
   END IF;
   IF NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN
     NEW.delivery_days:=(SELECT delivery_days FROM public.suppliers WHERE id=NEW.supplier_id);
   END IF;
   IF (NEW.sent_at IS DISTINCT FROM OLD.sent_at OR NEW.sent_to IS DISTINCT FROM OLD.sent_to)
      AND coalesce(auth.role(),'') <> 'service_role'
      AND NOT (OLD.sent_at IS NULL AND NEW.sent_at IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.purchase_order_email_events e
        WHERE e.purchase_order_id=NEW.id AND e.status='manual'
          AND e.sent_at=NEW.sent_at AND e.recipient=NEW.sent_to AND e.created_by=auth.uid()
      )) THEN
     RAISE EXCEPTION 'El envío requiere confirmación de correo o un registro manual autorizado';
   END IF;
   IF NEW.delivery_days IS DISTINCT FROM OLD.delivery_days AND (OLD.sent_at IS NOT NULL OR EXISTS(
     SELECT 1 FROM public.purchase_order_email_events WHERE purchase_order_id=OLD.id AND status IN ('processing','unknown'))) THEN
     RAISE EXCEPTION 'El plazo ya está fijado por el envío';
   END IF;
   IF NEW.status='anulada' AND OLD.status<>'anulada' AND EXISTS(
     SELECT 1 FROM public.purchase_order_email_events WHERE purchase_order_id=OLD.id AND status IN ('processing','unknown')) THEN
     RAISE EXCEPTION 'Hay un envío en curso o por verificar';
   END IF;
   NEW.completed_at := CASE WHEN NEW.status='completa' AND OLD.status<>'completa' THEN now()
                           WHEN NEW.status<>'completa' THEN NULL ELSE OLD.completed_at END;
 END IF;
 RETURN NEW;
END $function$
