-- La plantilla de cubicación pasa a ser solo por unidad; el tipo de unidad se asocia en el documento de venta.
-- Es seguro ejecutarla más de una vez.
DELETE FROM public.cubication_templates t
USING public.cubication_templates newer
WHERE t.unit_code = newer.unit_code
  AND (t.updated_at, t.id) < (newer.updated_at, newer.id);

ALTER TABLE public.cubication_templates
  DROP CONSTRAINT IF EXISTS cubication_templates_unit_type_unit_code_key;
ALTER TABLE public.cubication_templates
  DROP CONSTRAINT IF EXISTS cubication_templates_unit_code_key;
ALTER TABLE public.cubication_templates
  DROP CONSTRAINT IF EXISTS cubication_templates_unit_type_check;
ALTER TABLE public.cubication_templates
  DROP COLUMN IF EXISTS unit_type;
ALTER TABLE public.cubication_templates
  ADD CONSTRAINT cubication_templates_unit_code_key UNIQUE (unit_code);

DROP FUNCTION IF EXISTS public.save_cubication_template(text, numeric, numeric, numeric, numeric, jsonb);
DROP FUNCTION IF EXISTS public.save_cubication_template(text, text, numeric, numeric, numeric, numeric, jsonb);

CREATE OR REPLACE FUNCTION public.save_cubication_template(
  p_unit_code text,
  p_other_costs numeric,
  p_admin_pct numeric,
  p_retail_margin_pct numeric,
  p_distributor_margin_pct numeric,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_app_permission('movements', 'edit') THEN
    RAISE EXCEPTION 'No tienes permiso para guardar cubicaciones';
  END IF;

  INSERT INTO public.cubication_templates
    (unit_code, other_costs, admin_pct, retail_margin_pct, distributor_margin_pct, created_by)
  VALUES
    (p_unit_code, p_other_costs, p_admin_pct, p_retail_margin_pct, p_distributor_margin_pct, auth.uid())
  ON CONFLICT (unit_code) DO UPDATE SET
    other_costs = EXCLUDED.other_costs,
    admin_pct = EXCLUDED.admin_pct,
    retail_margin_pct = EXCLUDED.retail_margin_pct,
    distributor_margin_pct = EXCLUDED.distributor_margin_pct,
    updated_at = now()
  RETURNING id INTO v_id;

  DELETE FROM public.cubication_template_items WHERE template_id = v_id;
  INSERT INTO public.cubication_template_items (template_id, product_id, quantity)
  SELECT v_id, (item->>'product_id')::uuid, (item->>'quantity')::numeric
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS item;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_cubication_template(text, numeric, numeric, numeric, numeric, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_cubication_template(text, numeric, numeric, numeric, numeric, jsonb)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
