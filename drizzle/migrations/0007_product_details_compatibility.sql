DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'unit_cost'
  ) THEN
    ALTER TABLE public.products
      ADD COLUMN unit_cost numeric(12,2) NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'stock_quantity'
  ) THEN
    ALTER TABLE public.products
      ADD COLUMN stock_quantity numeric NOT NULL DEFAULT 0;
    UPDATE public.products SET stock_quantity = stock;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'barcode'
  ) THEN
    ALTER TABLE public.products ADD COLUMN barcode text;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique
  ON public.products(barcode)
  WHERE barcode IS NOT NULL AND barcode <> '';

CREATE OR REPLACE FUNCTION public.sync_product_stock_compatibility()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.unit_cost < 0 OR NEW.min_stock < 0 OR NEW.stock_quantity < 0 THEN
    RAISE EXCEPTION 'Costo y stock deben ser no negativos';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.stock_quantity = 0 AND NEW.stock <> 0 THEN
      NEW.stock_quantity := NEW.stock;
    ELSE
      NEW.stock := round(NEW.stock_quantity)::integer;
    END IF;
  ELSIF NEW.stock_quantity IS DISTINCT FROM OLD.stock_quantity THEN
    NEW.stock := round(NEW.stock_quantity)::integer;
  ELSIF NEW.stock IS DISTINCT FROM OLD.stock THEN
    NEW.stock_quantity := NEW.stock;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_product_stock_compatibility ON public.products;
CREATE TRIGGER sync_product_stock_compatibility
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_product_stock_compatibility();

NOTIFY pgrst, 'reload schema';
