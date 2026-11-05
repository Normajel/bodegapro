-- Contemar / BodegaPro: permitir que movimientos autorizados actualicen stock.
-- Las políticas RLS de INSERT/DELETE en stock_movements siguen decidiendo
-- quién puede registrar o anular movimientos. Esto NO otorga permiso de
-- edición directa sobre public.products.
-- La función solo se utiliza mediante el trigger trg_actualizar_stock_movimiento.
ALTER FUNCTION public.actualizar_stock_movimiento() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.actualizar_stock_movimiento()
  FROM PUBLIC, anon, authenticated;
