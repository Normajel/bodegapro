ALTER TABLE public.stock_movements ADD COLUMN unit_type text, ADD COLUMN folio integer;
WITH n AS (SELECT id, row_number() OVER (PARTITION BY type ORDER BY created_at) rn FROM public.stock_movements)
UPDATE public.stock_movements m SET folio = n.rn FROM n WHERE n.id = m.id;

CREATE OR REPLACE FUNCTION public.assign_movement_folio() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('folio_' || NEW.type::text));
  SELECT COALESCE(MAX(folio),0)+1 INTO NEW.folio FROM public.stock_movements WHERE type = NEW.type;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_assign_folio BEFORE INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.assign_movement_folio();

CREATE OR REPLACE FUNCTION public.update_stock_movement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s integer;
BEGIN
  UPDATE public.products SET stock = stock - CASE WHEN OLD.type='entrada' THEN OLD.quantity ELSE -OLD.quantity END, updated_at=now() WHERE id = OLD.product_id;
  SELECT stock INTO s FROM public.products WHERE id = NEW.product_id FOR UPDATE;
  IF NEW.type='salida' AND s < NEW.quantity THEN
    RAISE EXCEPTION 'Stock insuficiente: disponible %, solicitado %', s, NEW.quantity;
  END IF;
  IF OLD.type='entrada' AND s < 0 THEN
    RAISE EXCEPTION 'No se puede modificar: el stock quedaría negativo';
  END IF;
  UPDATE public.products SET stock = stock + CASE WHEN NEW.type='entrada' THEN NEW.quantity ELSE -NEW.quantity END, updated_at=now() WHERE id = NEW.product_id;
  IF NEW.type <> OLD.type THEN NEW.folio := OLD.folio; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_update_stock_movement BEFORE UPDATE OF product_id, type, quantity ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.update_stock_movement();