-- Keep inventory valuation synchronized with the latest recorded, valid purchase.
-- Approval alone and outgoing movements never establish a new inventory cost.
CREATE INDEX IF NOT EXISTS stock_movements_product_purchase_cost_idx
  ON public.stock_movements(product_id, created_at DESC, folio DESC)
  WHERE type = 'entrada';

CREATE OR REPLACE FUNCTION private.refresh_product_purchase_cost(p_product_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE latest_cost numeric;
BEGIN
  -- Serializes receipts for the same product; never changes stock quantities.
  PERFORM 1 FROM public.products WHERE id = p_product_id FOR UPDATE;
  SELECT candidate.price INTO latest_cost
  FROM (
    SELECT coalesce(i.unit_price, m.unit_cost) AS price, m.created_at,
           coalesce(m.folio, 0) AS sequence, m.id
    FROM public.stock_movements m
    LEFT JOIN public.purchase_entry_items i ON i.stock_movement_id = m.id
    LEFT JOIN public.purchase_entries e ON e.id = i.purchase_entry_id
    WHERE m.product_id = p_product_id AND m.type = 'entrada'
      AND (i.id IS NULL OR e.cancelled_at IS NULL)
      AND (i.id IS NOT NULL OR m.purchase_order_id IS NOT NULL OR m.supplier_id IS NOT NULL
           OR m.document_type IN ('factura', 'guia_despacho'))
    UNION ALL
    SELECT i.unit_price, i.created_at, 0, i.id
    FROM public.purchase_entry_items i
    JOIN public.purchase_entries e ON e.id = i.purchase_entry_id
    WHERE i.product_id = p_product_id AND i.stock_movement_id IS NULL AND e.cancelled_at IS NULL
  ) candidate
  WHERE candidate.price >= 0
  ORDER BY candidate.created_at DESC, candidate.sequence DESC, candidate.id DESC
  LIMIT 1;
  -- With no remaining valid purchase, preserve the last known inventory valuation.
  IF latest_cost IS NOT NULL THEN
    UPDATE public.products SET unit_cost = latest_cost, updated_at = now()
    WHERE id = p_product_id AND unit_cost IS DISTINCT FROM latest_cost;
  END IF;
END $$;
REVOKE ALL ON FUNCTION private.refresh_product_purchase_cost(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.sync_inventory_purchase_cost()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_product uuid; new_product uuid; product uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_product := OLD.product_id; END IF;
  IF TG_OP <> 'DELETE' THEN new_product := NEW.product_id; END IF;
  FOR product IN SELECT DISTINCT id FROM unnest(ARRAY[old_product,new_product]) AS ids(id)
                 WHERE id IS NOT NULL ORDER BY id LOOP
    PERFORM private.refresh_product_purchase_cost(product);
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.sync_inventory_purchase_cost() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sync_inventory_purchase_cost
AFTER INSERT OR DELETE OR UPDATE OF unit_cost,product_id,type,created_at,supplier_id,document_type,purchase_order_id
ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION private.sync_inventory_purchase_cost();

-- Legacy multi-item purchases write the amount in purchase_entry_items after
-- inserting the movement. Copy it to the movement within the same transaction.
CREATE OR REPLACE FUNCTION private.sync_purchase_item_cost()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_product uuid; new_product uuid; product uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_product := OLD.product_id; END IF;
  IF TG_OP <> 'DELETE' THEN
    new_product := NEW.product_id;
    IF NEW.stock_movement_id IS NOT NULL THEN
      UPDATE public.stock_movements m
      SET unit_cost = NEW.unit_price, measure_unit = NEW.unit
      WHERE m.id = NEW.stock_movement_id AND m.product_id = NEW.product_id
        AND m.type = 'entrada'
        AND (m.unit_cost IS DISTINCT FROM NEW.unit_price OR m.measure_unit IS DISTINCT FROM NEW.unit);
    END IF;
  END IF;
  FOR product IN SELECT DISTINCT id FROM unnest(ARRAY[old_product,new_product]) AS ids(id)
                 WHERE id IS NOT NULL ORDER BY id LOOP
    PERFORM private.refresh_product_purchase_cost(product);
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.sync_purchase_item_cost() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sync_purchase_item_cost
AFTER INSERT OR DELETE OR UPDATE OF unit_price,unit,product_id,stock_movement_id,created_at
ON public.purchase_entry_items FOR EACH ROW EXECUTE FUNCTION private.sync_purchase_item_cost();

CREATE OR REPLACE FUNCTION private.refresh_cancelled_purchase_cost()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE product uuid;
BEGIN
  FOR product IN SELECT DISTINCT product_id FROM public.purchase_entry_items
                 WHERE purchase_entry_id = NEW.id ORDER BY product_id LOOP
    PERFORM private.refresh_product_purchase_cost(product);
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.refresh_cancelled_purchase_cost() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER refresh_cancelled_purchase_cost AFTER UPDATE OF cancelled_at ON public.purchase_entries
FOR EACH ROW WHEN (OLD.cancelled_at IS DISTINCT FROM NEW.cancelled_at)
EXECUTE FUNCTION private.refresh_cancelled_purchase_cost();

-- Repair historical movements using their original receipt line amount.
UPDATE public.stock_movements m SET unit_cost = i.unit_price, measure_unit = i.unit
FROM public.purchase_entry_items i JOIN public.purchase_entries e ON e.id=i.purchase_entry_id
WHERE i.stock_movement_id=m.id AND e.cancelled_at IS NULL AND m.type='entrada'
  AND (m.unit_cost IS DISTINCT FROM i.unit_price OR m.measure_unit IS DISTINCT FROM i.unit);
DO $$ DECLARE product uuid;
BEGIN
  FOR product IN SELECT id FROM public.products ORDER BY id LOOP
    PERFORM private.refresh_product_purchase_cost(product);
  END LOOP;
END $$;
