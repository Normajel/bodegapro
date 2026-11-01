-- Additive migration on the restored single-company application. No inventory reset.
ALTER TABLE public.suppliers
  ADD COLUMN supplier_kind text NOT NULL DEFAULT 'productos' CHECK (supplier_kind IN ('productos','servicios','ambos')),
  ADD COLUMN delivery_days integer CHECK (delivery_days BETWEEN 0 AND 3650);
UPDATE public.suppliers s SET supplier_kind = CASE
 WHEN EXISTS (SELECT 1 FROM public.purchase_orders o JOIN public.purchase_order_items i ON i.purchase_order_id=o.id WHERE o.supplier_id=s.id AND i.item_type='producto') THEN 'ambos' ELSE 'servicios' END
WHERE EXISTS (SELECT 1 FROM public.purchase_orders o JOIN public.purchase_order_items i ON i.purchase_order_id=o.id WHERE o.supplier_id=s.id AND i.item_type='servicio');
ALTER TABLE public.purchase_orders
  ADD COLUMN delivery_days integer CHECK (delivery_days BETWEEN 0 AND 3650),
  ADD COLUMN sent_at timestamptz,
  ADD COLUMN sent_to text,
  ADD COLUMN completed_at timestamptz;
-- Old complete orders have no verified completion date; do not invent one.
CREATE TABLE public.accepted_services (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
 purchase_order_item_id uuid NOT NULL UNIQUE REFERENCES public.purchase_order_items(id) ON DELETE RESTRICT,
 supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
 supplier_name text NOT NULL, order_number text NOT NULL, description text NOT NULL,
 entered_at timestamptz NOT NULL, approved_at timestamptz, approved_by uuid,
 payment_terms text NOT NULL, quantity numeric NOT NULL CHECK(quantity>0),
 measure_unit text NOT NULL, net_total numeric NOT NULL, total numeric NOT NULL,
 status text NOT NULL DEFAULT 'ACEPTADO' CHECK(status IN ('ACEPTADO','ANULADO'))
);
ALTER TABLE public.accepted_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_accepted_services ON public.accepted_services FOR SELECT TO authenticated
 USING (public.has_app_permission('purchases','view') OR public.has_app_permission('movements','view'));
REVOKE ALL ON public.accepted_services FROM anon, authenticated;
GRANT SELECT ON public.accepted_services TO authenticated;
GRANT ALL ON public.accepted_services TO service_role;
CREATE INDEX accepted_services_supplier_date_idx ON public.accepted_services(supplier_id,approved_at DESC);

CREATE TABLE public.purchase_order_email_events (
 id uuid PRIMARY KEY,
 purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
 recipient text NOT NULL, subject text NOT NULL, created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
 status text NOT NULL DEFAULT 'processing' CHECK(status IN ('processing','sent','failed','unknown')),
 provider_id text, error_message text,
 CHECK(status <> 'sent' OR (sent_at IS NOT NULL AND provider_id IS NOT NULL))
);
ALTER TABLE public.purchase_order_email_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_purchase_email_events ON public.purchase_order_email_events FOR SELECT TO authenticated
 USING (public.has_app_permission('purchases','view'));
REVOKE ALL ON public.purchase_order_email_events FROM anon,authenticated;
GRANT SELECT ON public.purchase_order_email_events TO authenticated;
GRANT ALL ON public.purchase_order_email_events TO service_role;
CREATE INDEX purchase_email_order_idx ON public.purchase_order_email_events(purchase_order_id,created_at DESC);

CREATE OR REPLACE FUNCTION private.sync_accepted_services() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.approval_status='aprobada' THEN
  INSERT INTO public.accepted_services(purchase_order_id,purchase_order_item_id,supplier_id,supplier_name,order_number,description,entered_at,approved_at,approved_by,payment_terms,quantity,measure_unit,net_total,total,status)
  SELECT NEW.id,i.id,NEW.supplier_id,s.name,NEW.order_number,i.description,NEW.created_at,NEW.approved_at,NEW.approved_by,
    CASE WHEN NEW.payment_terms='otro' THEN NEW.payment_terms_other ELSE NEW.payment_terms END,
    i.quantity,i.measure_unit,i.line_total,round(i.line_total*(1+NEW.vat_rate),0),
    CASE WHEN NEW.status='anulada' THEN 'ANULADO' ELSE 'ACEPTADO' END
  FROM public.purchase_order_items i JOIN public.suppliers s ON s.id=NEW.supplier_id
  WHERE i.purchase_order_id=NEW.id AND i.item_type='servicio'
  ON CONFLICT(purchase_order_item_id) DO NOTHING;
 END IF;
 IF NEW.status='anulada' THEN
   UPDATE public.accepted_services SET status='ANULADO' WHERE purchase_order_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.sync_accepted_services() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_accepted_services AFTER UPDATE OF approval_status,status ON public.purchase_orders
 FOR EACH ROW EXECUTE FUNCTION private.sync_accepted_services();
-- Backfill with the existing approval timestamps, without manufacturing stock movements.
INSERT INTO public.accepted_services(purchase_order_id,purchase_order_item_id,supplier_id,supplier_name,order_number,description,entered_at,approved_at,approved_by,payment_terms,quantity,measure_unit,net_total,total,status)
 SELECT o.id,i.id,s.id,s.name,o.order_number,i.description,o.created_at,o.approved_at,o.approved_by,
 CASE WHEN o.payment_terms='otro' THEN o.payment_terms_other ELSE o.payment_terms END,
 i.quantity,i.measure_unit,i.line_total,round(i.line_total*(1+o.vat_rate),0),CASE WHEN o.status='anulada' THEN 'ANULADO' ELSE 'ACEPTADO' END
 FROM public.purchase_orders o JOIN public.purchase_order_items i ON i.purchase_order_id=o.id JOIN public.suppliers s ON s.id=o.supplier_id
 WHERE o.approval_status='aprobada' AND i.item_type='servicio';

CREATE OR REPLACE FUNCTION private.guard_order_delivery() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
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
      AND coalesce(auth.role(),'') <> 'service_role' THEN
     RAISE EXCEPTION 'El envío solo puede registrarlo el servicio de correo';
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
END $$;
REVOKE ALL ON FUNCTION private.guard_order_delivery() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_order_delivery BEFORE INSERT OR UPDATE ON public.purchase_orders
 FOR EACH ROW EXECUTE FUNCTION private.guard_order_delivery();

CREATE OR REPLACE FUNCTION private.guard_order_line_contract() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE oid uuid; kind text; approved text;
BEGIN
 oid:=CASE WHEN TG_OP='DELETE' THEN OLD.purchase_order_id ELSE NEW.purchase_order_id END;
 SELECT o.approval_status,s.supplier_kind INTO approved,kind FROM public.purchase_orders o JOIN public.suppliers s ON s.id=o.supplier_id WHERE o.id=oid;
 IF TG_OP='UPDATE' AND NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id AND EXISTS (SELECT 1 FROM public.purchase_orders WHERE id=OLD.purchase_order_id AND approval_status='aprobada') THEN
  RAISE EXCEPTION 'No se pueden mover líneas de una OC aprobada';
 END IF;
 IF approved='aprobada' AND (TG_OP<>'UPDATE' OR
    (to_jsonb(NEW)-'received_quantity'-'line_total') IS DISTINCT FROM (to_jsonb(OLD)-'received_quantity'-'line_total')) THEN
   RAISE EXCEPTION 'No se pueden modificar líneas contratadas de una OC aprobada';
 END IF;
 IF TG_OP<>'DELETE' THEN
   IF (TG_OP='INSERT' OR NEW.item_type IS DISTINCT FROM OLD.item_type) AND ((NEW.item_type='servicio' AND kind='productos') OR (NEW.item_type='producto' AND kind='servicios')) THEN
     RAISE EXCEPTION 'El tipo de proveedor no corresponde a los productos o servicios de la OC';
   END IF;
   RETURN NEW;
 END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION private.guard_order_line_contract() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_order_line_contract BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_order_items
 FOR EACH ROW EXECUTE FUNCTION private.guard_order_line_contract();

CREATE OR REPLACE VIEW public.purchase_delivery_summary WITH(security_invoker=true) AS
 SELECT o.id,o.order_number,o.supplier_id,o.status,o.approval_status,o.approved_at,o.sent_at,o.sent_to,o.delivery_days,o.completed_at,
 CASE WHEN o.sent_at IS NOT NULL AND o.delivery_days IS NOT NULL THEN (o.sent_at AT TIME ZONE 'America/Santiago')::date+o.delivery_days END AS due_date,
 count(i.id) FILTER(WHERE i.item_type='producto')::integer AS product_lines,
 coalesce(sum(i.quantity) FILTER(WHERE i.item_type='producto'),0) AS ordered_quantity,
 coalesce(sum(i.received_quantity) FILTER(WHERE i.item_type='producto'),0) AS received_quantity,
 coalesce(sum(greatest(0,i.quantity-i.received_quantity)) FILTER(WHERE i.item_type='producto'),0) AS pending_quantity
 FROM public.purchase_orders o LEFT JOIN public.purchase_order_items i ON i.purchase_order_id=o.id GROUP BY o.id;
REVOKE ALL ON public.purchase_delivery_summary FROM anon;
GRANT SELECT ON public.purchase_delivery_summary TO authenticated,service_role;

-- Service-only finalization: the public browser cannot mark an email as successfully sent.
CREATE OR REPLACE FUNCTION private.record_successful_order_email() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='sent' AND OLD.status<>'sent' THEN
   UPDATE public.purchase_orders SET sent_at=coalesce(sent_at,NEW.sent_at),sent_to=coalesce(sent_to,NEW.recipient),updated_at=now()
    WHERE id=NEW.purchase_order_id AND approval_status='aprobada' AND status<>'anulada';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.record_successful_order_email() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER record_successful_order_email AFTER UPDATE ON public.purchase_order_email_events
 FOR EACH ROW EXECUTE FUNCTION private.record_successful_order_email();

CREATE OR REPLACE FUNCTION private.begin_purchase_order_email(p_order_id uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.purchase_orders%ROWTYPE; s public.suppliers%ROWTYPE; e public.purchase_order_email_events%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.has_app_permission('purchases','view'),false)
    OR NOT (coalesce(public.has_app_permission('purchases','edit'),false) OR coalesce(public.can_approve_purchase_orders(),false)) THEN
   RAISE EXCEPTION 'No tienes permiso para enviar órdenes de compra';
 END IF;
 SELECT * INTO o FROM public.purchase_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.approval_status<>'aprobada' OR o.status='anulada' THEN RAISE EXCEPTION 'La OC debe estar aprobada y vigente'; END IF;
 SELECT * INTO e FROM public.purchase_order_email_events WHERE id=p_request_id;
 IF FOUND THEN
   IF e.purchase_order_id<>o.id OR e.created_by<>auth.uid() THEN RAISE EXCEPTION 'Solicitud de envío inválida'; END IF;
   RETURN jsonb_build_object('event',to_jsonb(e),'existing',true);
 END IF;
 IF EXISTS(SELECT 1 FROM public.purchase_order_email_events WHERE purchase_order_id=o.id AND status IN ('processing','unknown')) THEN
   RAISE EXCEPTION 'Hay un envío en curso o por verificar. Revisa su historial antes de reenviar';
 END IF;
 SELECT * INTO STRICT s FROM public.suppliers WHERE id=o.supplier_id;
 IF nullif(btrim(s.email),'') IS NULL OR s.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'El proveedor necesita un correo válido'; END IF;
 IF EXISTS(SELECT 1 FROM public.purchase_order_items WHERE purchase_order_id=o.id AND item_type='producto') AND o.delivery_days IS NULL THEN
   RAISE EXCEPTION 'Configura el plazo de entrega de la OC antes de enviarla';
 END IF;
 INSERT INTO public.purchase_order_email_events(id,purchase_order_id,recipient,subject,created_by)
 VALUES(p_request_id,o.id,btrim(s.email),'Orden de compra '||o.order_number,auth.uid()) RETURNING * INTO e;
 RETURN jsonb_build_object('event',to_jsonb(e),'existing',false,'order',to_jsonb(o),'supplier',to_jsonb(s),
  'items',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM public.purchase_order_items i WHERE i.purchase_order_id=o.id),
  'company',(SELECT to_jsonb(c) FROM public.company_settings c LIMIT 1));
END $$;
REVOKE ALL ON FUNCTION private.begin_purchase_order_email(uuid,uuid) FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.begin_purchase_order_email(uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.begin_purchase_order_email(p_order_id uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.begin_purchase_order_email(p_order_id,p_request_id) $$;
REVOKE ALL ON FUNCTION public.begin_purchase_order_email(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.begin_purchase_order_email(uuid,uuid) TO authenticated;

-- Preserve the restricted, invoker-security supplier directory while exposing classification only.
CREATE OR REPLACE VIEW public.supplier_directory WITH(security_barrier=true,security_invoker=true) AS
 SELECT id,name,supplier_kind,delivery_days FROM public.suppliers
 WHERE public.has_app_permission('contacts','view') OR public.has_app_permission('movements','view')
    OR public.has_app_permission('purchases','view') OR public.has_app_permission('reports','view');
