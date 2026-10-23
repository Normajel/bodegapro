DROP POLICY IF EXISTS "Read suppliers for permitted modules" ON public.suppliers;
CREATE POLICY "Read suppliers in contacts module" ON public.suppliers
  FOR SELECT TO authenticated
  USING (public.has_app_permission('contacts', 'view'));

DROP POLICY IF EXISTS "Read customers for permitted modules" ON public.customers;
CREATE POLICY "Read customers in contacts module" ON public.customers
  FOR SELECT TO authenticated
  USING (public.has_app_permission('contacts', 'view'));

CREATE OR REPLACE VIEW public.supplier_directory
WITH (security_barrier = true)
AS
SELECT id, name
FROM public.suppliers
WHERE public.has_app_permission('contacts', 'view')
  OR public.has_app_permission('movements', 'view')
  OR public.has_app_permission('purchases', 'view')
  OR public.has_app_permission('reports', 'view');

CREATE OR REPLACE VIEW public.customer_directory
WITH (security_barrier = true)
AS
SELECT id, name
FROM public.customers
WHERE public.has_app_permission('contacts', 'view')
  OR public.has_app_permission('movements', 'view')
  OR public.has_app_permission('reports', 'view');

REVOKE ALL ON public.supplier_directory, public.customer_directory FROM PUBLIC, anon;
GRANT SELECT ON public.supplier_directory, public.customer_directory TO authenticated;

NOTIFY pgrst, 'reload schema';
