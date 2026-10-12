import { useQuery } from "@tanstack/react-query";
import { getAppSettings, DEFAULT_APP_SETTINGS } from "@/lib/settings.functions";

export type AppSettings = {
  [K in keyof typeof DEFAULT_APP_SETTINGS]: (typeof DEFAULT_APP_SETTINGS)[K] extends number
    ? number
    : string;
};

export const settings: AppSettings = { ...DEFAULT_APP_SETTINGS };

let loading: Promise<AppSettings> | null = null;
let loadedAt = 0;

/** Read settings from the Railway PostgreSQL-backed server function, cached for three seconds. */
export function loadSettings(): Promise<AppSettings> {
  if (!loading || Date.now() - loadedAt > 3000) {
    loading = getAppSettings()
      .then((row) => {
        Object.assign(settings, row);
        loadedAt = Date.now();
        return settings;
      })
      .catch((error: unknown) => {
        console.error("Settings load error:", error);
        loadedAt = Date.now();
        return settings;
      });
  }
  return loading;
}

/** Live admin-configurable settings for display; never used to authorize rewards. */
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
