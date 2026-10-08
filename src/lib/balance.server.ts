/** Atomically add (or subtract) balance. Returns new balance, or null if it would go negative / player missing. */
export async function credit(tgId: string, amt: number): Promise<number | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.rpc("add_balance", { _tg: tgId, _amt: amt });
  return (data as number | null) ?? null;
}
