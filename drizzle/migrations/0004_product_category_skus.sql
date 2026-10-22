CREATE OR REPLACE FUNCTION public.prepare_product()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  category_name text;
  prefix text;
  next_sku_number bigint;
BEGIN
  IF NEW.unit_cost < 0 OR NEW.min_stock < 0 OR NEW.stock_quantity < 0 THEN
    RAISE EXCEPTION 'Costo y stock deben ser no negativos';
  END IF;

  IF TG_OP = 'INSERT' AND (NEW.sku IS NULL OR btrim(NEW.sku) = '') THEN
    category_name := upper(btrim(coalesce(NEW.category, '')));
    prefix := CASE category_name
      WHEN 'ESTRUCTURA' THEN 'ESTR'
      WHEN 'PINTURA' THEN 'PINT'
      WHEN 'CARPINTERIA' THEN 'CARP'
      WHEN 'PISO LINOLEO' THEN 'PLIN'
      WHEN 'CIRCUITO ELECTRICO' THEN 'CIEL'
      WHEN 'FUSION' THEN 'FUS'
      WHEN 'ARTEFACTO ELECTRICO' THEN 'AREL'
      WHEN 'ARTEFACTO GASFITERIA' THEN 'ARGAS'
      WHEN 'DETALLES' THEN 'DET'
      ELSE coalesce(
        nullif(left(regexp_replace(category_name, '[^A-Z0-9]', '', 'g'), 4), ''),
        'OTRO'
      )
    END;

    PERFORM pg_advisory_xact_lock(hashtext('product_sku_' || prefix));

    SELECT coalesce(
      max(
        CASE
          WHEN substring(p.sku FROM char_length(prefix) + 1) ~ '^[0-9]+$'
          THEN substring(p.sku FROM char_length(prefix) + 1)::bigint
        END
      ),
      0
    ) + 1
    INTO next_sku_number
    FROM public.products AS p
    WHERE p.sku LIKE prefix || '%';

    NEW.sku := prefix || lpad(next_sku_number::text, 3, '0');
  END IF;

  NEW.stock := round(NEW.stock_quantity)::integer;
  RETURN NEW;
END;
$$;
