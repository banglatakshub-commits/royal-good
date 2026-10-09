import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/database";
import { app_settings } from "../../drizzle/schema";

/**
 * Columns that every visitor may read. getAppSettings is public, so it must never select the
 * Nekpayment credentials (nek_api_key, nek_secret_key). Add a column here only if it is safe to publish.
 */
export const publicSettingsColumns = {
  task_reward: app_settings.task_reward,
  ref_bonus: app_settings.ref_bonus,
  min_withdraw: app_settings.min_withdraw,
  daily_spins: app_settings.daily_spins,
  ads_script_id: app_settings.ads_script_id,
  daily_ads: app_settings.daily_ads,
  ad_reward: app_settings.ad_reward,
  ad_seconds: app_settings.ad_seconds,
  daily_typing: app_settings.daily_typing,
  daily_quiz: app_settings.daily_quiz,
  support_telegram_username: app_settings.support_telegram_username,
  activation_fee: app_settings.activation_fee,
} as const;

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
  activation_fee: 100,
} as const;

export const getAppSettings = createServerFn({ method: "GET" }).handler(async () => {
  const db = getDb();
  const [row] = await db
    .select(publicSettingsColumns)
    .from(app_settings)
    .where(eq(app_settings.id, 1))
    .limit(1);
  return row ?? { ...DEFAULT_APP_SETTINGS };
});
