BEGIN;

CREATE FUNCTION private.read_cubication_document(p_unit_code text)
RETURNS TABLE (
  template_id uuid, unit_code text, product_id uuid, quantity numeric,
  product_name text, sku text, category text, unit text, stock numeric, unit_cost numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT t.id, t.unit_code, p.id, i.quantity,
    p.name, p.sku, p.category, p.unit, coalesce(p.stock_quantity, p.stock), p.unit_cost
  FROM public.cubication_templates t
  LEFT JOIN public.cubication_template_items i
    ON p_unit_code IS NOT NULL AND i.template_id = t.id
  LEFT JOIN public.products p ON p.id = i.product_id
  WHERE auth.uid() IS NOT NULL
    AND public.has_app_permission('cubication_document', 'view')
    AND (p_unit_code IS NULL OR t.unit_code = p_unit_code)
  ORDER BY t.unit_code, i.id;
$$;
REVOKE ALL ON FUNCTION private.read_cubication_document(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.read_cubication_document(text) TO authenticated;

CREATE FUNCTION public.read_cubication_document(p_unit_code text)
RETURNS TABLE (
  template_id uuid, unit_code text, product_id uuid, quantity numeric,
  product_name text, sku text, category text, unit text, stock numeric, unit_cost numeric
)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT * FROM private.read_cubication_document(p_unit_code);
$$;
REVOKE ALL ON FUNCTION public.read_cubication_document(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.read_cubication_document(text) TO authenticated;

COMMIT;
