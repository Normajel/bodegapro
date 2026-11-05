BEGIN;

CREATE OR REPLACE FUNCTION private.stamp_inventory_adjustment_edit()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  stock_delta numeric;
BEGIN
  NEW.reason := btrim(NEW.reason);
  IF NEW.adjusted_stock IS DISTINCT FROM OLD.adjusted_stock THEN
    IF NEW.adjusted_stock IS NULL OR NEW.adjusted_stock < 0
       OR NEW.adjusted_stock IN ('NaN'::numeric, 'Infinity'::numeric)
       OR NEW.adjusted_stock <> trunc(NEW.adjusted_stock) THEN
      RAISE EXCEPTION 'El stock ajustado debe ser un número entero igual o mayor a cero';
    END IF;

    -- Apply only the correction, preserving later entries and exits.
    stock_delta := NEW.adjusted_stock - OLD.adjusted_stock;
    UPDATE public.products
    SET stock_quantity = stock_quantity + stock_delta
    WHERE id = OLD.product_id AND stock_quantity + stock_delta >= 0;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No se puede corregir el ajuste: el producto ya no está disponible o el stock actual quedaría negativo';
    END IF;
  END IF;

  IF NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.adjusted_stock IS DISTINCT FROM OLD.adjusted_stock THEN
    NEW.edited_at := clock_timestamp();
    NEW.edited_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

GRANT UPDATE (adjusted_stock) ON public.inventory_adjustments TO authenticated;

COMMIT;
