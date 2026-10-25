-- Solo ADMIN puede modificar el stock directamente (ajuste de inventario).
-- Los movimientos y compras actualizan el stock desde otros triggers
-- (profundidad > 1), por lo que no se ven afectados.
CREATE OR REPLACE FUNCTION public.guard_product_stock_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF pg_trigger_depth() = 1
     AND auth.uid() IS NOT NULL
     AND NEW.stock_quantity IS DISTINCT FROM OLD.stock_quantity
     AND NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede modificar el stock directamente';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aa_guard_product_stock_edit ON public.products;
CREATE TRIGGER aa_guard_product_stock_edit
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.guard_product_stock_edit();
