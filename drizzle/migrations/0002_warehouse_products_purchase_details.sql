ALTER TABLE public.products ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL, ADD COLUMN barcode text, ADD COLUMN stock_quantity numeric NOT NULL DEFAULT 0;
UPDATE public.products SET stock_quantity = stock;
ALTER TABLE public.stock_movements ADD COLUMN quantity_value numeric NOT NULL DEFAULT 1, ADD COLUMN measure_unit text, ADD COLUMN unit_cost numeric, ADD COLUMN purchase_order text, ADD COLUMN document_type text, ADD COLUMN document_number text, ADD COLUMN unit_type_value text, ADD COLUMN batch_id uuid;
UPDATE public.stock_movements m SET quantity_value=m.quantity, measure_unit=p.unit, unit_cost=p.unit_cost FROM public.products p WHERE p.id=m.product_id;
CREATE SEQUENCE public.product_sku_sequence;
GRANT USAGE ON SEQUENCE public.product_sku_sequence TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.prepare_product() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE prefix text;
BEGIN
 IF NEW.unit_cost < 0 OR NEW.min_stock < 0 OR NEW.stock_quantity < 0 THEN RAISE EXCEPTION 'Costo y stock deben ser no negativos'; END IF;
 IF TG_OP='INSERT' AND (NEW.sku IS NULL OR btrim(NEW.sku)='') THEN
 prefix:=CASE NEW.category WHEN 'Estructura' THEN 'EST' WHEN 'Pintura' THEN 'PIN' WHEN 'Gasfitería' THEN 'GAS' WHEN 'Carpintería' THEN 'CAR' WHEN 'Artículos eléctricos' THEN 'ELE' WHEN 'Detalles' THEN 'DET' ELSE 'GEN' END;
 NEW.sku:=prefix || '-' || lpad(nextval('public.product_sku_sequence')::text,6,'0');
 END IF;
 NEW.stock:=round(NEW.stock_quantity)::integer;
 RETURN NEW;
END $$;
CREATE TRIGGER prepare_product_trigger BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.prepare_product();
CREATE UNIQUE INDEX products_barcode_unique ON public.products(barcode) WHERE barcode IS NOT NULL AND barcode<>'';
CREATE OR REPLACE FUNCTION public.validate_movement_details() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.quantity_value<=0 OR NEW.quantity_value IS NULL THEN RAISE EXCEPTION 'La cantidad debe ser mayor a cero'; END IF;
 IF NEW.unit_cost<0 THEN RAISE EXCEPTION 'El costo no puede ser negativo'; END IF;
 IF NEW.document_type IS NOT NULL AND NEW.document_type NOT IN ('factura','guia_despacho') THEN RAISE EXCEPTION 'Documento inválido'; END IF;
 NEW.quantity:=greatest(1,round(NEW.quantity_value)::integer);
 RETURN NEW;
END $$;
CREATE TRIGGER a_validate_movement_details BEFORE INSERT OR UPDATE ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.validate_movement_details();
CREATE OR REPLACE FUNCTION public.assign_movement_folio() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('folio_' || NEW.type::text));
 IF NEW.batch_id IS NOT NULL THEN SELECT folio INTO NEW.folio FROM public.stock_movements WHERE batch_id=NEW.batch_id AND type=NEW.type LIMIT 1; END IF;
 IF NEW.folio IS NULL THEN SELECT coalesce(max(folio),0)+1 INTO NEW.folio FROM public.stock_movements WHERE type=NEW.type; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.apply_stock_movement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s numeric;
BEGIN
 SELECT stock_quantity INTO s FROM public.products WHERE id=NEW.product_id FOR UPDATE;
 IF NEW.type='salida' AND s<NEW.quantity_value THEN RAISE EXCEPTION 'Stock insuficiente: disponible %, solicitado %',s,NEW.quantity_value; END IF;
 UPDATE public.products SET stock_quantity=stock_quantity+CASE WHEN NEW.type='entrada' THEN NEW.quantity_value ELSE -NEW.quantity_value END,updated_at=now() WHERE id=NEW.product_id;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.revert_stock_movement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.products SET stock_quantity=stock_quantity+CASE WHEN OLD.type='entrada' THEN -OLD.quantity_value ELSE OLD.quantity_value END,updated_at=now() WHERE id=OLD.product_id;
 RETURN OLD;
END $$;
CREATE OR REPLACE FUNCTION public.update_stock_movement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s numeric;
BEGIN
 IF NEW.type<>OLD.type THEN RAISE EXCEPTION 'No se puede cambiar el tipo de un movimiento registrado'; END IF;
 IF NEW.product_id=OLD.product_id THEN
 UPDATE public.products SET stock_quantity=stock_quantity+CASE WHEN NEW.type='entrada' THEN NEW.quantity_value-OLD.quantity_value ELSE OLD.quantity_value-NEW.quantity_value END,updated_at=now() WHERE id=NEW.product_id;
 ELSE
 UPDATE public.products SET stock_quantity=stock_quantity+CASE WHEN OLD.type='entrada' THEN -OLD.quantity_value ELSE OLD.quantity_value END,updated_at=now() WHERE id=OLD.product_id;
 SELECT stock_quantity INTO s FROM public.products WHERE id=NEW.product_id FOR UPDATE;
 IF NEW.type='salida' AND s<NEW.quantity_value THEN RAISE EXCEPTION 'Stock insuficiente'; END IF;
 UPDATE public.products SET stock_quantity=stock_quantity+CASE WHEN NEW.type='entrada' THEN NEW.quantity_value ELSE -NEW.quantity_value END,updated_at=now() WHERE id=NEW.product_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER update_movement_quantity_value BEFORE UPDATE OF quantity_value ON public.stock_movements FOR EACH ROW WHEN (OLD.product_id=NEW.product_id AND OLD.type=NEW.type AND OLD.quantity=NEW.quantity) EXECUTE FUNCTION public.update_stock_movement();
CREATE OR REPLACE FUNCTION public.refresh_purchase_price() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pid uuid; latest numeric;
BEGIN
 pid:=CASE WHEN TG_OP='DELETE' THEN OLD.product_id ELSE NEW.product_id END;
 SELECT unit_cost INTO latest FROM public.stock_movements WHERE product_id=pid AND type='entrada' AND unit_cost IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 1;
 IF latest IS NOT NULL THEN UPDATE public.products SET unit_cost=latest WHERE id=pid; END IF;
 IF TG_OP='UPDATE' AND OLD.product_id<>NEW.product_id THEN
 SELECT unit_cost INTO latest FROM public.stock_movements WHERE product_id=OLD.product_id AND type='entrada' AND unit_cost IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 1;
 IF latest IS NOT NULL THEN UPDATE public.products SET unit_cost=latest WHERE id=OLD.product_id; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER z_refresh_purchase_price AFTER INSERT OR UPDATE OR DELETE ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.refresh_purchase_price();
CREATE INDEX movements_product_purchase_date ON public.stock_movements(product_id,created_at DESC) WHERE type='entrada';
COMMENT ON COLUMN public.products.stock IS 'DEPRECATED: compatibility rounded mirror; use stock_quantity';
COMMENT ON COLUMN public.stock_movements.quantity IS 'DEPRECATED: compatibility rounded mirror; use quantity_value';