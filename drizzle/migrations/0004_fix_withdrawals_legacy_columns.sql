-- Older versions of this project created the `withdrawals` table with extra NOT NULL
-- columns (e.g. player_tg_id, account) that the current insert does not populate, so
-- every new withdrawal failed with a not-null violation. Make any such leftover column
-- nullable so inserts with only the current columns succeed. Idempotent and data-safe.
DO $$
DECLARE
  col text;
BEGIN
  FOR col IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'withdrawals'
      AND is_nullable = 'NO'
      AND column_name NOT IN ('id', 'tg_id', 'amount', 'method', 'number', 'status')
  LOOP
    EXECUTE format('ALTER TABLE public.withdrawals ALTER COLUMN %I DROP NOT NULL', col);
  END LOOP;
END $$;
