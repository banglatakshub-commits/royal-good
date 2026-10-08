DROP POLICY IF EXISTS "anyone read admin ids" ON public.admin_telegram_ids;
REVOKE SELECT ON public.admin_telegram_ids FROM anon, authenticated;

REVOKE SELECT ON public.withdrawals FROM anon, authenticated;
GRANT SELECT (id, tg_id, name, amount, method, status, created_at, note) ON public.withdrawals TO anon, authenticated;