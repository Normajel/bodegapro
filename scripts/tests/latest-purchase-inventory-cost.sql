-- Run as database owner. Test rows are rolled back; no real purchases are changed.
BEGIN;
DO $$
DECLARE product uuid := gen_random_uuid(); first_movement uuid; second_movement uuid;
        legacy_movement uuid; entry uuid; item uuid; expected numeric;
BEGIN
  INSERT INTO public.products(id,sku,name,unit,unit_cost,stock,stock_quantity)
  VALUES(product,'QA-COST-'||product,'Verificación temporal de costos','UN',50,0,0);
  INSERT INTO public.stock_movements(product_id,type,quantity,unit_cost,document_type,created_at)
  VALUES(product,'entrada',3,100,'factura',now()-interval '2 days') RETURNING id INTO first_movement;
  SELECT unit_cost INTO expected FROM public.products WHERE id=product;
  IF expected <> 100 THEN RAISE EXCEPTION 'First purchase cost: %',expected; END IF;
  INSERT INTO public.stock_movements(product_id,type,quantity,unit_cost,document_type,created_at)
  VALUES(product,'entrada',2,150,'guia_despacho',now()-interval '1 day') RETURNING id INTO second_movement;
  SELECT unit_cost INTO expected FROM public.products WHERE id=product;
  IF expected <> 150 THEN RAISE EXCEPTION 'Latest purchase cost: %',expected; END IF;
  UPDATE public.stock_movements SET unit_cost=900 WHERE id=first_movement;
  SELECT unit_cost INTO expected FROM public.products WHERE id=product;
  IF expected <> 150 THEN RAISE EXCEPTION 'Old edited receipt replaced latest cost: %',expected; END IF;
  INSERT INTO public.stock_movements(product_id,type,quantity,unit_cost,document_type)
  VALUES(product,'salida',1,999,'factura');
  SELECT unit_cost INTO expected FROM public.products WHERE id=product;
  IF expected <> 150 THEN RAISE EXCEPTION 'Outgoing movement changed cost: %',expected; END IF;
  DELETE FROM public.stock_movements WHERE id=second_movement;
  SELECT unit_cost INTO expected FROM public.products WHERE id=product;
  IF expected <> 900 THEN RAISE EXCEPTION 'Deleted receipt fallback: %',expected; END IF;
  INSERT INTO public.purchase_entries(document_type,document_number) VALUES('factura','QA-COST') RETURNING id INTO entry;
  INSERT INTO public.stock_movements(product_id,type,quantity,unit_cost) VALUES(product,'entrada',1,NULL) RETURNING id INTO legacy_movement;
  INSERT INTO public.purchase_entry_items(purchase_entry_id,stock_movement_id,product_id,quantity,unit,unit_price)
  VALUES(entry,legacy_movement,product,1,'UN',800) RETURNING id INTO item;
  IF (SELECT unit_cost FROM public.stock_movements WHERE id=legacy_movement) <> 800
     OR (SELECT unit_cost FROM public.products WHERE id=product) <> 800 THEN
    RAISE EXCEPTION 'Legacy purchase did not synchronize inventory and movement';
  END IF;
  UPDATE public.purchase_entry_items SET unit_price=700 WHERE id=item;
  IF (SELECT unit_cost FROM public.stock_movements WHERE id=legacy_movement) <> 700
     OR (SELECT unit_cost FROM public.products WHERE id=product) <> 700 THEN
    RAISE EXCEPTION 'Edited item did not synchronize inventory and movement';
  END IF;
  UPDATE public.purchase_entries SET cancelled_at=now() WHERE id=entry;
  SELECT unit_cost INTO expected FROM public.products WHERE id=product;
  IF expected <> 900 THEN RAISE EXCEPTION 'Cancelled purchase fallback: %',expected; END IF;
  INSERT INTO public.stock_movements(product_id,type,quantity,unit_cost,document_type,created_at)
  VALUES(product,'entrada',1,0,'factura',now()+interval '1 second');
  SELECT unit_cost INTO expected FROM public.products WHERE id=product;
  IF expected <> 0 THEN RAISE EXCEPTION 'Zero cost is valid: %',expected; END IF;
  IF (SELECT stock FROM public.products WHERE id=product) <> 4 THEN
    RAISE EXCEPTION 'Cost synchronization altered quantity';
  END IF;
END $$;
SELECT 'passed: receipt, latest price, historical edit, outgoing, deletion, legacy purchase, item edit, cancellation, zero price, quantities' AS result;
ROLLBACK;
