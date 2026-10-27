DROP FUNCTION IF EXISTS public.save_cubication_template(text, numeric, numeric, numeric, numeric, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.save_cubication_template(text, numeric, numeric, numeric, numeric, jsonb);

ALTER TABLE public.cubication_templates
  DROP COLUMN IF EXISTS cost_breakdown,
  DROP COLUMN IF EXISTS other_costs,
  DROP COLUMN IF EXISTS admin_pct,
  DROP COLUMN IF EXISTS retail_margin_pct,
  DROP COLUMN IF EXISTS distributor_margin_pct;

CREATE OR REPLACE FUNCTION public.save_cubication_template(
  p_unit_code text,
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
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'La lista de ítems no tiene un formato válido';
  END IF;

  INSERT INTO public.cubication_templates (unit_code, created_by)
  VALUES (p_unit_code, auth.uid())
  ON CONFLICT (unit_code) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_id;

  DELETE FROM public.cubication_template_items WHERE template_id = v_id;
  INSERT INTO public.cubication_template_items (template_id, product_id, quantity)
  SELECT v_id, (item->>'product_id')::uuid, (item->>'quantity')::numeric
  FROM jsonb_array_elements(p_items) AS item;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_cubication_template(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_cubication_template(text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
