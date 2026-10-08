import { db } from "@/lib/database";
import { app_settings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { useQuery } from "@tanstack/react-query";

export interface AppSettings {
  task_reward: number;
  ref_bonus: number;
  min_withdraw: number;
  daily_spins: number;
  ads_script_id: string;
  daily_ads: number;
  ad_reward: number;
  ad_seconds: number;
  support_telegram_username: string;
}

export const settings: AppSettings = { 
  task_reward: 5, 
  ref_bonus: 5, 
  min_withdraw: 50, 
  daily_spins: 2, 
  ads_script_id: "8416", 
  daily_ads: 10, 
  ad_reward: 5, 
  ad_seconds: 15, 
  support_telegram_username: "" 
};

let loading: Promise<AppSettings> | null = null;
let loadedAt = 0;

/** Always fresh: re-reads admin settings unless fetched in the last 3 seconds. */
export function loadSettings() {
  if (!loading || Date.now() - loadedAt > 3000) {
    loadedAt = Date.now();
    loading = (async () => {
      try {
        const data = await db.select().from(app_settings).where(eq(app_settings.id, 1)).limit(1);
        
        if (data.length > 0) {
          const newSettings = {
            task_reward: data[0].task_reward,
            ref_bonus: data[0].ref_bonus,
            min_withdraw: data[0].min_withdraw,
            daily_spins: data[0].daily_spins,
            ads_script_id: data[0].ads_script_id,
            daily_ads: data[0].daily_ads,
            ad_reward: data[0].ad_reward,
            ad_seconds: data[0].ad_seconds,
            support_telegram_username: data[0].support_telegram_username
          };
          Object.assign(settings, newSettings);
        }
      } catch (error) {
        console.error("Settings load error:", error);
      }
      return settings;
    })();
  }
  return loading;
}

/** Live admin settings for display; refreshes every 10s and on focus. */
export function useLiveSettings() {
  const { data } = useQuery({
    queryKey: ["live-settings"],
    queryFn: async () => ({ ...(await loadSettings()) }),
    staleTime: 0,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });
  return data ?? settings;
}
