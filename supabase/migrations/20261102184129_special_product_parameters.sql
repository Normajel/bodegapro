-- Parámetros compartidos por todos los formularios de producto especial.
CREATE TABLE public.special_product_parameters (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK(kind IN ('category','unit')),
 label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 80 AND label=btrim(label)),
 active boolean NOT NULL DEFAULT true,
 UNIQUE(kind,label)
);
ALTER TABLE public.special_product_parameters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.special_product_parameters FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.special_product_parameters TO authenticated;
CREATE FUNCTION public.can_manage_special_product_parameters() RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT public.can_access_special_products() AND EXISTS (
 SELECT 1 FROM public.profiles p JOIN public.app_roles r ON r.id=p.role_id
 WHERE p.id=auth.uid() AND r.name IN ('ADMIN','ADMINPRO'));
$$;
REVOKE ALL ON FUNCTION public.can_manage_special_product_parameters() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_special_product_parameters() TO authenticated;
CREATE POLICY special_parameters_read ON public.special_product_parameters FOR SELECT TO authenticated USING(public.can_access_special_products());
CREATE POLICY special_parameters_create ON public.special_product_parameters FOR INSERT TO authenticated WITH CHECK(public.can_manage_special_product_parameters());
CREATE POLICY special_parameters_update ON public.special_product_parameters FOR UPDATE TO authenticated USING(public.can_manage_special_product_parameters()) WITH CHECK(public.can_manage_special_product_parameters());
INSERT INTO public.special_product_parameters(kind,label) SELECT 'category',x FROM unnest(ARRAY['ESTRUCTURA','PINTURA','CARPINTERIA','PISO LINOLEO','CIRCUITO ELECTRICO','FUSION','ARTEFACTO ELECTRICO','ARTEFACTO GASFITERIA','DETALLES']) x;
INSERT INTO public.special_product_parameters(kind,label) SELECT 'unit',x FROM unnest(ARRAY['unidad','kg','rollo','lata','tambor','mt','lts','m²','m³','caja','par']) x;
-- Conservar categorías y unidades que ya se utilizaron, sin reescribir productos o compras.
INSERT INTO public.special_product_parameters(kind,label) SELECT DISTINCT 'category',btrim(category) FROM public.special_products WHERE length(btrim(category)) BETWEEN 1 AND 80 ON CONFLICT DO NOTHING;
INSERT INTO public.special_product_parameters(kind,label) SELECT DISTINCT 'unit',btrim(unit) FROM public.special_products WHERE length(btrim(unit)) BETWEEN 1 AND 80 ON CONFLICT DO NOTHING;
-- La restricción también se aplica a peticiones directas, no solo a las listas del modal.
CREATE FUNCTION public.validate_special_product_parameters() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.special_product_parameters WHERE kind='category' AND label=NEW.category AND active) THEN RAISE EXCEPTION 'Selecciona una categoría habilitada. Solo Admin puede administrar opciones'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.special_product_parameters WHERE kind='unit' AND label=NEW.unit AND active) THEN RAISE EXCEPTION 'Selecciona una unidad de medida habilitada. Solo Admin puede administrar opciones'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_special_product_parameters() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_special_product_parameters BEFORE INSERT OR UPDATE OF category,unit ON public.special_products FOR EACH ROW EXECUTE FUNCTION public.validate_special_product_parameters();
NOTIFY pgrst,'reload schema';
