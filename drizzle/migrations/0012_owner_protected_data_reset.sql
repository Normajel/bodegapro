CREATE OR REPLACE FUNCTION public.reset_business_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF to_regclass('public.purchase_entry_items') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.purchase_entry_items';
  END IF;
  IF to_regclass('public.purchase_entries') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.purchase_entries';
  END IF;

  DELETE FROM public.stock_movements;
  DELETE FROM public.purchase_order_items;
  DELETE FROM public.purchase_orders;
  DELETE FROM public.products;
  DELETE FROM public.suppliers;
  DELETE FROM public.customers;

  IF to_regclass('public.product_sku_sequence') IS NOT NULL THEN
    PERFORM setval('public.product_sku_sequence'::regclass, 1, false);
  END IF;
  IF to_regclass('public.purchase_order_number_seq') IS NOT NULL THEN
    PERFORM setval('public.purchase_order_number_seq'::regclass, 1, false);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_business_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_business_data() TO service_role;

NOTIFY pgrst, 'reload schema';
