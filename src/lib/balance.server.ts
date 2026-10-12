import { sql } from "drizzle-orm";
import { getDb, type Database } from "./database";

export type BalanceExecutor = Pick<Database, "execute">;

/** Update a balance inside the caller's transaction; refuses negative balances. */
export async function creditWithin(
  executor: BalanceExecutor,
  tgId: string,
  amount: number,
): Promise<number | null> {
  const result = await executor.execute(sql`
    UPDATE public.players
    SET balance = balance + ${amount}, updated_at = NOW()
    WHERE tg_id = ${tgId}
      AND balance + ${amount} >= 0
    RETURNING balance
  `);
  const row = result[0] as { balance?: number | string } | undefined;
  return row?.balance == null ? null : Number(row.balance);
}

/** Atomically add or subtract a balance using its own transaction. */
export async function credit(tgId: string, amount: number): Promise<number | null> {
  const db = getDb();
  return db.transaction(async (tx) => creditWithin(tx as unknown as BalanceExecutor, tgId, amount));
}
