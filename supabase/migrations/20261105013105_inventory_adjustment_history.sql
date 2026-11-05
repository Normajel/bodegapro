BEGIN;

CREATE TABLE public.inventory_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  initial_stock numeric NOT NULL,
  adjusted_stock numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  edited_at timestamptz,
  edited_by uuid
);

CREATE INDEX inventory_adjustments_recent_idx
  ON public.inventory_adjustments (created_at DESC, id DESC);

ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventory_adjustments FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE (reason) ON public.inventory_adjustments TO authenticated;

CREATE POLICY inventory_adjustments_read ON public.inventory_adjustments
  FOR SELECT TO authenticated
  USING ((SELECT public.is_app_admin() AND public.has_app_permission('inventory', 'view')
    AND auth.jwt()->>'aal' = 'aal2'));

CREATE POLICY inventory_adjustments_edit ON public.inventory_adjustments
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_app_admin() AND public.has_app_permission('inventory', 'edit')
    AND auth.jwt()->>'aal' = 'aal2'))
  WITH CHECK ((SELECT public.is_app_admin() AND public.has_app_permission('inventory', 'edit')
    AND auth.jwt()->>'aal' = 'aal2'));

CREATE FUNCTION private.stamp_inventory_adjustment_edit()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.reason := btrim(NEW.reason);
  IF NEW.reason IS DISTINCT FROM OLD.reason THEN
    NEW.edited_at := clock_timestamp();
    NEW.edited_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.stamp_inventory_adjustment_edit() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER stamp_inventory_adjustment_edit BEFORE UPDATE ON public.inventory_adjustments
  FOR EACH ROW EXECUTE FUNCTION private.stamp_inventory_adjustment_edit();

-- Input-only field. The trigger consumes it in the same transaction and clears it.
ALTER TABLE public.products ADD COLUMN stock_adjustment_reason text
  CONSTRAINT products_clear_adjustment_reason CHECK (stock_adjustment_reason IS NULL);

CREATE FUNCTION private.record_inventory_adjustment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  adjustment_reason text := btrim(NEW.stock_adjustment_reason);
BEGIN
  NEW.stock_adjustment_reason := NULL;
  IF TG_OP = 'UPDATE' AND pg_trigger_depth() = 1 AND auth.uid() IS NOT NULL
     AND NEW.stock_quantity IS DISTINCT FROM OLD.stock_quantity THEN
    IF NOT coalesce(public.is_app_admin() AND public.has_app_permission('inventory', 'edit')
        AND auth.jwt()->>'aal' = 'aal2', false) THEN
      RAISE EXCEPTION 'Solo Admin y AdminPro pueden ajustar el inventario';
    END IF;
    IF adjustment_reason IS NULL OR char_length(adjustment_reason) NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION 'Indica el motivo del ajuste de inventario (máximo 500 caracteres)';
    END IF;
    INSERT INTO public.inventory_adjustments
      (product_id, description, category, initial_stock, adjusted_stock, created_by, reason)
    VALUES
      (NEW.id, NEW.name, NEW.category, OLD.stock_quantity, NEW.stock_quantity, auth.uid(), adjustment_reason);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.record_inventory_adjustment() FROM PUBLIC, anon, authenticated;

-- Runs after sync_product_stock_compatibility, so legacy writes to stock are covered too.
CREATE TRIGGER zz_record_inventory_adjustment BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION private.record_inventory_adjustment();

COMMIT;
