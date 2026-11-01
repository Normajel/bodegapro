-- A role-scoped summary, intentionally returning no product names, IDs or lists.
CREATE OR REPLACE FUNCTION public.get_role_notifications()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text; approvals boolean := false; receipts boolean := false; low_stock boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE='42501';
  END IF;
  SELECT upper(btrim(r.name)) INTO role_name FROM public.profiles p
  JOIN public.app_roles r ON r.id=p.role_id WHERE p.id=auth.uid();
  IF role_name IS NULL OR role_name NOT IN ('ADMIN','GERENCIA','GERENTE') THEN
    RAISE EXCEPTION 'No tienes acceso a estas notificaciones' USING ERRCODE='42501';
  END IF;
  IF role_name='ADMIN' AND coalesce(auth.jwt()->>'aal','') <> 'aal2' THEN
    RAISE EXCEPTION 'Verifica tu segundo factor' USING ERRCODE='42501';
  END IF;
  IF role_name IN ('GERENCIA','GERENTE') THEN
    SELECT EXISTS(SELECT 1 FROM public.purchase_orders
      WHERE approval_status='por_aprobar' AND status<>'anulada') INTO approvals;
  ELSE
    SELECT EXISTS(SELECT 1 FROM public.purchase_orders o
      JOIN public.purchase_order_items i ON i.purchase_order_id=o.id
      WHERE o.approval_status='aprobada' AND o.status NOT IN ('anulada','completa')
        AND i.item_type='producto' AND i.quantity > i.received_quantity) INTO receipts;
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.products
    WHERE active IS TRUE AND coalesce(stock_quantity,stock,0)<=coalesce(min_stock,0)) INTO low_stock;
  RETURN jsonb_build_object('approvals_pending',approvals,'receipts_pending',receipts,'low_stock',low_stock);
END $$;
REVOKE ALL ON FUNCTION public.get_role_notifications() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_role_notifications() TO authenticated;
