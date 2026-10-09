import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/database";
import { app_settings } from "../../drizzle/schema";

export const DEFAULT_APP_SETTINGS = {
  task_reward: 5,
  ref_bonus: 5,
  min_withdraw: 50,
  daily_spins: 2,
  ads_script_id: "8416",
  daily_ads: 10,
  ad_reward: 5,
  ad_seconds: 15,
  daily_typing: 5,
  daily_quiz: 5,
  support_telegram_username: "",
} as const;

export const getAppSettings = createServerFn({ method: "GET" }).handler(async () => {
  const db = getDb();
  const [row] = await db.select().from(app_settings).where(eq(app_settings.id, 1)).limit(1);
  if (!row) return { ...DEFAULT_APP_SETTINGS };

  return {
    task_reward: row.task_reward,
    ref_bonus: row.ref_bonus,
    min_withdraw: row.min_withdraw,
    daily_spins: row.daily_spins,
    ads_script_id: row.ads_script_id,
    daily_ads: row.daily_ads,
    ad_reward: row.ad_reward,
    ad_seconds: row.ad_seconds,
    daily_typing: row.daily_typing,
    daily_quiz: row.daily_quiz,
    support_telegram_username: row.support_telegram_username,
  };
});
