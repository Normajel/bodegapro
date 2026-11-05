CREATE TABLE IF NOT EXISTS public.contractor_service_prices (
 supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
 service_key text NOT NULL,
 service_name text NOT NULL,
 current_unit_cost numeric NOT NULL CHECK (current_unit_cost >= 0),
 previous_unit_costs jsonb NOT NULL DEFAULT '[]'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (supplier_id, service_key)
);
ALTER TABLE public.contractor_service_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY contractor_service_prices_read ON public.contractor_service_prices FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.purchase_orders o WHERE o.supplier_id = contractor_service_prices.supplier_id));
REVOKE ALL ON public.contractor_service_prices FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.contractor_service_prices TO authenticated;
CREATE OR REPLACE FUNCTION public.save_contractor_service_price(p_supplier_id uuid, p_description text, p_cost numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE k text := lower(btrim(p_description));
BEGIN
 IF p_supplier_id IS NULL OR k IS NULL OR k = '' THEN RETURN; END IF;
 INSERT INTO public.contractor_service_prices AS current_price (supplier_id, service_key, service_name, current_unit_cost)
 VALUES (p_supplier_id, k, btrim(p_description), p_cost)
 ON CONFLICT (supplier_id, service_key) DO UPDATE SET
   service_name = EXCLUDED.service_name,
   previous_unit_costs = CASE WHEN current_price.current_unit_cost IS DISTINCT FROM EXCLUDED.current_unit_cost
     THEN (SELECT coalesce(jsonb_agg(value ORDER BY pos), '[]'::jsonb) FROM
       (SELECT value,pos FROM
         (SELECT to_jsonb(current_price.current_unit_cost) AS value, 0::bigint AS pos
          UNION ALL SELECT value, ord::bigint AS pos
          FROM jsonb_array_elements(current_price.previous_unit_costs) WITH ORDINALITY AS h(value,ord)) all_prices
        ORDER BY pos LIMIT 3) previous_three)
     ELSE current_price.previous_unit_costs END,
   current_unit_cost = EXCLUDED.current_unit_cost,
   updated_at = CASE WHEN current_price.current_unit_cost IS DISTINCT FROM EXCLUDED.current_unit_cost
     THEN now() ELSE current_price.updated_at END;
END $$;
REVOKE ALL ON FUNCTION public.save_contractor_service_price(uuid,text,numeric) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.record_contractor_service_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE supplier uuid;
BEGIN
 IF NEW.item_type = 'servicio' THEN
   SELECT supplier_id INTO supplier FROM public.purchase_orders WHERE id=NEW.purchase_order_id;
   PERFORM public.save_contractor_service_price(supplier,NEW.description,NEW.unit_cost);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_contractor_service_price() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER record_contractor_service_price AFTER INSERT ON public.purchase_order_items
FOR EACH ROW EXECUTE FUNCTION public.record_contractor_service_price();
DO $$
DECLARE item record;
BEGIN
 FOR item IN SELECT o.supplier_id,i.description,i.unit_cost
   FROM public.purchase_order_items i JOIN public.purchase_orders o ON o.id=i.purchase_order_id
   WHERE i.item_type='servicio' AND o.status<>'anulada' ORDER BY o.created_at,i.id
 LOOP
   PERFORM public.save_contractor_service_price(item.supplier_id,item.description,item.unit_cost);
 END LOOP;
END $$;
