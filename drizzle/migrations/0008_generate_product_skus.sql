CREATE SEQUENCE IF NOT EXISTS public.product_sku_sequence;
GRANT USAGE, SELECT ON SEQUENCE public.product_sku_sequence TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prepare_product_sku()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  prefix text;
  generated_sku text;
BEGIN
  IF NEW.sku IS NOT NULL AND btrim(NEW.sku) <> '' THEN
    RETURN NEW;
  END IF;

  prefix := CASE upper(btrim(coalesce(NEW.category, '')))
    WHEN 'ESTRUCTURA' THEN 'ESTR'
    WHEN 'PINTURA' THEN 'PINT'
    WHEN 'CARPINTERIA' THEN 'CARP'
    WHEN 'PISO LINOLEO' THEN 'PLIN'
    WHEN 'CIRCUITO ELECTRICO' THEN 'CIEL'
    WHEN 'FUSION' THEN 'FUS'
    WHEN 'ARTEFACTO ELECTRICO' THEN 'AREL'
    WHEN 'ARTEFACTO GASFITERIA' THEN 'ARGAS'
    WHEN 'DETALLES' THEN 'DET'
    ELSE 'GEN'
  END;

  LOOP
    generated_sku := prefix || '-' || lpad(nextval('public.product_sku_sequence')::text, 6, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.products WHERE sku = generated_sku
    );
  END LOOP;

  NEW.sku := generated_sku;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_generate_sku ON public.products;
CREATE TRIGGER products_generate_sku
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.prepare_product_sku();

UPDATE public.products
SET sku = ''
WHERE sku IS NULL OR btrim(sku) = '';
