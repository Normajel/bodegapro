-- Enforce whole-number inventory quantities while preserving NUMERIC columns.
-- This migration mirrors the live Supabase changes tested in the demo project.

-- Keep stock synchronization triggers separate: INSERT/DELETE use the legacy
-- trigger; UPDATE uses the dedicated function to avoid applying the delta twice.
DROP TRIGGER IF EXISTS trg_actualizar_stock_movimiento ON public.stock_movements;

CREATE TRIGGER trg_actualizar_stock_movimiento
AFTER INSERT OR DELETE ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION public.actualizar_stock_movimiento();

CREATE OR REPLACE FUNCTION public.sync_stock_movement_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  old_stock numeric;
  new_stock numeric;
  old_delta numeric;
  new_delta numeric;
BEGIN
  PERFORM product.id
  FROM public.products product
  WHERE product.id IN (OLD.product_id, NEW.product_id)
  ORDER BY product.id
  FOR UPDATE;

  old_delta := CASE WHEN OLD.type = 'entrada' THEN OLD.quantity ELSE -OLD.quantity END;
  new_delta := CASE WHEN NEW.type = 'entrada' THEN NEW.quantity ELSE -NEW.quantity END;

  IF OLD.product_id = NEW.product_id THEN
    SELECT product.stock INTO old_stock
    FROM public.products product
    WHERE product.id = NEW.product_id;

    new_stock := old_stock - old_delta + new_delta;

    IF new_stock < 0 THEN
      RAISE EXCEPTION 'Stock insuficiente para modificar la salida. Disponible %, solicitado %',
        old_stock - old_delta, NEW.quantity;
    END IF;

    UPDATE public.products
    SET stock = new_stock, updated_at = now()
    WHERE id = NEW.product_id;
  ELSE
    SELECT product.stock INTO old_stock
    FROM public.products product
    WHERE product.id = OLD.product_id;

    SELECT product.stock INTO new_stock
    FROM public.products product
    WHERE product.id = NEW.product_id;

    IF NEW.type = 'salida' AND new_stock < NEW.quantity THEN
      RAISE EXCEPTION 'Stock insuficiente: disponible %, solicitado %', new_stock, NEW.quantity;
    END IF;

    IF OLD.type = 'entrada' AND old_stock < OLD.quantity THEN
      RAISE EXCEPTION 'No se puede reducir o mover la compra: parte del stock ya fue utilizado';
    END IF;

    UPDATE public.products
    SET stock = stock - old_delta, updated_at = now()
    WHERE id = OLD.product_id;

    UPDATE public.products
    SET stock = stock + new_delta, updated_at = now()
    WHERE id = NEW.product_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- NUMERIC remains the storage/calculation type; fractional quantities are rejected.
ALTER TABLE public.products
  ADD CONSTRAINT products_stock_integer_check
    CHECK (stock = trunc(stock)),
  ADD CONSTRAINT products_stock_quantity_integer_check
    CHECK (stock_quantity IS NULL OR stock_quantity = trunc(stock_quantity));

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_quantity_integer_check
    CHECK (quantity = trunc(quantity)),
  ADD CONSTRAINT stock_movements_quantity_value_integer_check
    CHECK (quantity_value IS NULL OR quantity_value = trunc(quantity_value));

ALTER TABLE public.purchase_entry_items
  ADD CONSTRAINT purchase_entry_items_quantity_integer_check
    CHECK (quantity = trunc(quantity));