DROP POLICY IF EXISTS "Anyone can insert player" ON public.players;
DROP POLICY IF EXISTS "Anyone can update player" ON public.players;
DROP POLICY IF EXISTS "insert referrals" ON public.referrals;
DROP POLICY IF EXISTS "anyone create pending withdrawal" ON public.withdrawals;
REVOKE INSERT, UPDATE, DELETE ON public.players FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.referrals FROM anon, authenticated;
REVOKE INSERT, DELETE ON public.withdrawals FROM anon, authenticated;
GRANT ALL ON public.players, public.referrals, public.withdrawals TO service_role;

CREATE TABLE IF NOT EXISTS public.task_claims (
  tg_id text NOT NULL,
  task_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tg_id, task_id)
);
GRANT ALL ON public.task_claims TO service_role;
ALTER TABLE public.task_claims ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.add_balance(_tg text, _amt integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nb integer;
BEGIN
  UPDATE public.players SET balance = balance + _amt, updated_at = now()
  WHERE tg_id = _tg AND balance + _amt >= 0
  RETURNING balance INTO nb;
  RETURN nb;
END $$;
REVOKE ALL ON FUNCTION public.add_balance(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_balance(text, integer) TO service_role;