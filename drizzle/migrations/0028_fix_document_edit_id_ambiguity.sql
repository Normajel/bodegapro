DO $$
DECLARE
  function_definition text;
  old_alias text := 'AS ids(movement_id)';
  new_alias text := 'AS ids(provided_id)';
BEGIN
  function_definition := pg_get_functiondef(
    'public.editar_salida_documento(uuid[], jsonb)'::regprocedure
  );
  IF position(old_alias IN function_definition) = 0
     AND position(new_alias IN function_definition) = 0 THEN
    RAISE EXCEPTION 'No se encontró el alias esperado en editar_salida_documento';
  END IF;
  function_definition := replace(function_definition, old_alias, new_alias);
  function_definition := replace(
    function_definition,
    'count(DISTINCT movement_id)',
    'count(DISTINCT provided_id)'
  );
  EXECUTE function_definition;

  function_definition := pg_get_functiondef(
    'public.editar_entrada_documento(uuid[], jsonb)'::regprocedure
  );
  IF position(old_alias IN function_definition) = 0
     AND position(new_alias IN function_definition) = 0 THEN
    RAISE EXCEPTION 'No se encontró el alias esperado en editar_entrada_documento';
  END IF;
  function_definition := replace(function_definition, old_alias, new_alias);
  function_definition := replace(
    function_definition,
    'count(DISTINCT movement_id)',
    'count(DISTINCT provided_id)'
  );
  EXECUTE function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
