DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'stock_movements'
      AND policyname = 'Team full access movements'
  ) THEN
    CREATE POLICY "Team full access movements"
      ON public.stock_movements
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
