ALTER TABLE public.cubication_templates
  ADD COLUMN IF NOT EXISTS cost_breakdown jsonb NOT NULL DEFAULT
    '{"structure":"","error":"","carpentry":"","miscellaneous":"","linoleum":"","paint":"","fabrication":"","administrative":"","publicPrice":"","distributorPrice":""}'::jsonb;

DROP FUNCTION IF EXISTS public.save_cubication_template(text, numeric, numeric, numeric, numeric, jsonb);

CREATE OR REPLACE FUNCTION public.save_cubication_template(
  p_unit_code text,
  p_other_costs numeric,
  p_admin_pct numeric,
  p_retail_margin_pct numeric,
  p_distributor_margin_pct numeric,
  p_items jsonb,
  p_cost_breakdown jsonb DEFAULT '{}'::jsonb
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
  IF jsonb_typeof(p_cost_breakdown) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Los costos de cubicación no tienen un formato válido';
  END IF;

  INSERT INTO public.cubication_templates (
    unit_code,
    other_costs,
    admin_pct,
    retail_margin_pct,
    distributor_margin_pct,
    cost_breakdown,
    created_by
  )
  VALUES (
    p_unit_code,
    coalesce(p_other_costs, 0),
    coalesce(p_admin_pct, 0),
    coalesce(p_retail_margin_pct, 0),
    coalesce(p_distributor_margin_pct, 0),
    p_cost_breakdown,
    auth.uid()
  )
  ON CONFLICT (unit_code) DO UPDATE SET
    other_costs = EXCLUDED.other_costs,
    admin_pct = EXCLUDED.admin_pct,
    retail_margin_pct = EXCLUDED.retail_margin_pct,
    distributor_margin_pct = EXCLUDED.distributor_margin_pct,
    cost_breakdown = EXCLUDED.cost_breakdown,
    updated_at = now()
  RETURNING id INTO v_id;

  DELETE FROM public.cubication_template_items WHERE template_id = v_id;
  INSERT INTO public.cubication_template_items (template_id, product_id, quantity)
  SELECT v_id, (item->>'product_id')::uuid, (item->>'quantity')::numeric
  FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) AS item;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_cubication_template(text, numeric, numeric, numeric, numeric, jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_cubication_template(text, numeric, numeric, numeric, numeric, jsonb, jsonb)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
