BEGIN;

-- Keep product creation available while reserving nonzero opening balances
-- for administrators authorized to edit inventory.
CREATE POLICY products_initial_stock_requires_admin
ON public.products AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (
  (stock_quantity = 0 AND stock = 0)
  OR (SELECT public.is_app_admin() AND public.has_app_permission('inventory', 'edit')
      AND auth.jwt()->>'aal' = 'aal2')
);

COMMIT;
