-- Solo los perfiles ADMIN y GERENTE pueden aprobar órdenes de compra.

CREATE OR REPLACE FUNCTION public.can_approve_purchase_orders()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles profile
    JOIN public.app_roles role ON role.id = profile.role_id
    WHERE profile.id = auth.uid()
      AND upper(btrim(role.name)) IN ('ADMIN', 'GERENCIA', 'GERENTE')
  );
$$;

REVOKE ALL ON FUNCTION public.can_approve_purchase_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_approve_purchase_orders() TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_purchase_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  order_row public.purchase_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión'; END IF;
  IF NOT public.can_approve_purchase_orders() THEN
    RAISE EXCEPTION 'Solo un gerente o administrador puede aprobar órdenes de compra';
  END IF;

  SELECT * INTO order_row
  FROM public.purchase_orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF order_row.id IS NULL THEN RAISE EXCEPTION 'Orden de compra no encontrada'; END IF;
  IF order_row.status <> 'pendiente' THEN
    RAISE EXCEPTION 'Solo se pueden aprobar órdenes pendientes';
  END IF;
  IF order_row.approval_status <> 'por_aprobar' THEN
    RAISE EXCEPTION 'La orden ya fue aprobada';
  END IF;

  UPDATE public.purchase_orders
  SET approval_status = 'aprobada',
      approved_by = auth.uid(),
      approved_at = now(),
      updated_at = now()
  WHERE id = p_order_id;
END $$;

REVOKE ALL ON FUNCTION public.approve_purchase_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_purchase_order(uuid) TO authenticated;

-- Evita aprobar con un UPDATE/INSERT directo desde la API.
CREATE OR REPLACE FUNCTION public.guard_purchase_order_approval()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NEW.approval_status = 'aprobada'
     AND (TG_OP = 'INSERT' OR OLD.approval_status IS DISTINCT FROM 'aprobada')
     AND NOT public.can_approve_purchase_orders() THEN
    RAISE EXCEPTION 'Solo un gerente o administrador puede aprobar órdenes de compra';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS purchase_orders_guard_approval ON public.purchase_orders;
CREATE TRIGGER purchase_orders_guard_approval
  BEFORE INSERT OR UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_order_approval();

REVOKE ALL ON FUNCTION public.guard_purchase_order_approval() FROM PUBLIC, anon, authenticated;
