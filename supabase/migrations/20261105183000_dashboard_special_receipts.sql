-- Recepciones especiales visibles en el panel diario de Contemar, sin afectar stock.
CREATE OR REPLACE FUNCTION public.dashboard_special_receipts(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (
 id uuid, created_at timestamptz, description text, sku text,
 measure_unit text, document_type text, document_number text,
 quantity numeric, unit_cost numeric, order_number text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
 SELECT r.id, r.received_at, sp.name, sp.sku, sp.unit,
        r.document_type, r.document_number, r.quantity, r.unit_cost, po.order_number
 FROM public.special_product_receipts r
 JOIN public.special_products sp ON sp.id=r.special_product_id
 JOIN public.purchase_orders po ON po.id=r.purchase_order_id
 WHERE auth.uid() IS NOT NULL
   AND public.has_app_permission('dashboard','view') IS TRUE
   AND p_from IS NOT NULL AND p_to IS NOT NULL
   AND p_from < p_to AND p_to - p_from <= interval '8 days'
   AND r.received_at >= p_from AND r.received_at < p_to
 ORDER BY r.received_at DESC, r.id DESC
$$;
REVOKE ALL ON FUNCTION public.dashboard_special_receipts(timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dashboard_special_receipts(timestamptz,timestamptz) TO authenticated;