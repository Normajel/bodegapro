-- Plantillas de cubicación: una por tipo de unidad (stock, arriendo, nota_venta) y código de unidad.
CREATE TABLE IF NOT EXISTS public.cubication_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_type text NOT NULL CHECK (unit_type IN ('stock', 'arriendo', 'nota_venta')),
  unit_code text NOT NULL,
  other_costs numeric NOT NULL DEFAULT 0 CHECK (other_costs >= 0),
  admin_pct numeric NOT NULL DEFAULT 10 CHECK (admin_pct >= 0),
  retail_margin_pct numeric NOT NULL DEFAULT 30 CHECK (retail_margin_pct >= 0),
  distributor_margin_pct numeric NOT NULL DEFAULT 15 CHECK (distributor_margin_pct >= 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit_type, unit_code)
);

CREATE TABLE IF NOT EXISTS public.cubication_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.cubication_templates(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  UNIQUE (template_id, product_id)
);

CREATE INDEX IF NOT EXISTS cubication_template_items_template_idx
  ON public.cubication_template_items (template_id);

ALTER TABLE public.cubication_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cubication_template_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read cubication templates" ON public.cubication_templates;
CREATE POLICY "Read cubication templates" ON public.cubication_templates
  FOR SELECT TO authenticated USING (public.has_app_permission('movements', 'view'));
DROP POLICY IF EXISTS "Insert cubication templates" ON public.cubication_templates;
CREATE POLICY "Insert cubication templates" ON public.cubication_templates
  FOR INSERT TO authenticated WITH CHECK (public.has_app_permission('movements', 'create'));
DROP POLICY IF EXISTS "Update cubication templates" ON public.cubication_templates;
CREATE POLICY "Update cubication templates" ON public.cubication_templates
  FOR UPDATE TO authenticated
  USING (public.has_app_permission('movements', 'edit'))
  WITH CHECK (public.has_app_permission('movements', 'edit'));
DROP POLICY IF EXISTS "Delete cubication templates" ON public.cubication_templates;
CREATE POLICY "Delete cubication templates" ON public.cubication_templates
  FOR DELETE TO authenticated USING (public.has_app_permission('movements', 'edit'));

DROP POLICY IF EXISTS "Read cubication items" ON public.cubication_template_items;
CREATE POLICY "Read cubication items" ON public.cubication_template_items
  FOR SELECT TO authenticated USING (public.has_app_permission('movements', 'view'));
DROP POLICY IF EXISTS "Insert cubication items" ON public.cubication_template_items;
CREATE POLICY "Insert cubication items" ON public.cubication_template_items
  FOR INSERT TO authenticated WITH CHECK (public.has_app_permission('movements', 'edit'));
DROP POLICY IF EXISTS "Update cubication items" ON public.cubication_template_items;
CREATE POLICY "Update cubication items" ON public.cubication_template_items
  FOR UPDATE TO authenticated
  USING (public.has_app_permission('movements', 'edit'))
  WITH CHECK (public.has_app_permission('movements', 'edit'));
DROP POLICY IF EXISTS "Delete cubication items" ON public.cubication_template_items;
CREATE POLICY "Delete cubication items" ON public.cubication_template_items
  FOR DELETE TO authenticated USING (public.has_app_permission('movements', 'edit'));

-- Guarda plantilla e ítems de forma atómica (reemplaza los ítems existentes).
CREATE OR REPLACE FUNCTION public.save_cubication_template(
  p_unit_type text,
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
    (unit_type, unit_code, other_costs, admin_pct, retail_margin_pct, distributor_margin_pct, created_by)
  VALUES
    (p_unit_type, p_unit_code, p_other_costs, p_admin_pct, p_retail_margin_pct, p_distributor_margin_pct, auth.uid())
  ON CONFLICT (unit_type, unit_code) DO UPDATE SET
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

REVOKE ALL ON FUNCTION public.save_cubication_template(text, text, numeric, numeric, numeric, numeric, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_cubication_template(text, text, numeric, numeric, numeric, numeric, jsonb)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
