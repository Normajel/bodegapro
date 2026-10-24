-- Datos de la empresa (para el formato de órdenes de compra) y datos
-- adicionales de proveedores: RUT, ciudad y dirección de despacho.

CREATE TABLE IF NOT EXISTS public.company_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  name text NOT NULL DEFAULT '' CHECK (char_length(name) <= 200),
  rut text NOT NULL DEFAULT '' CHECK (char_length(rut) <= 20),
  business_activity text NOT NULL DEFAULT '' CHECK (char_length(business_activity) <= 300),
  address text NOT NULL DEFAULT '' CHECK (char_length(address) <= 300),
  phone text NOT NULL DEFAULT '' CHECK (char_length(phone) <= 40),
  email text NOT NULL DEFAULT '' CHECK (char_length(email) <= 200),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.company_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;

DROP POLICY IF EXISTS "Read company settings" ON public.company_settings;
CREATE POLICY "Read company settings" ON public.company_settings
  FOR SELECT TO authenticated
  USING (
    public.has_app_permission('purchases', 'view')
    OR public.has_app_permission('settings', 'manage')
  );

DROP POLICY IF EXISTS "Insert company settings" ON public.company_settings;
CREATE POLICY "Insert company settings" ON public.company_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_app_permission('settings', 'manage'));

DROP POLICY IF EXISTS "Update company settings" ON public.company_settings;
CREATE POLICY "Update company settings" ON public.company_settings
  FOR UPDATE TO authenticated
  USING (public.has_app_permission('settings', 'manage'))
  WITH CHECK (public.has_app_permission('settings', 'manage'));

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS rut text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS delivery_address text;

-- Datos del proveedor para imprimir la orden de compra. La vista
-- supplier_directory solo expone id y nombre, por eso se usa esta función.
CREATE OR REPLACE FUNCTION public.get_supplier_order_info(p_supplier_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  rut text,
  city text,
  address text,
  delivery_address text,
  contact_name text,
  phone text,
  email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id, s.name, s.rut, s.city, s.address, s.delivery_address,
         s.contact_name, s.phone, s.email
  FROM public.suppliers s
  WHERE s.id = p_supplier_id
    AND (
      public.has_app_permission('purchases', 'view')
      OR public.has_app_permission('contacts', 'view')
    );
$$;

REVOKE ALL ON FUNCTION public.get_supplier_order_info(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_supplier_order_info(uuid) TO authenticated;
