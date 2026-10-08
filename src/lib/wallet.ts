import { useEffect, useState } from "react";
import { syncPlayer, fetchMyBalance } from "@/lib/players";
import { loadSettings } from "@/lib/settings";

// Balance shown in the app is a cache of the server value. Only the server can change it.
let restored = false;
let poller: ReturnType<typeof setInterval> | null = null;
const KEY = "lg_balance";

export function getBalance() {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(KEY) ?? 0);
}

/** Update the cached balance with a value returned by the server. */
export function setServerBalance(next: number | null | undefined) {
  if (typeof next !== "number") return;
  localStorage.setItem(KEY, String(next));
  window.dispatchEvent(new Event("lg-balance"));
}

export async function refreshBalance() {
  setServerBalance(await fetchMyBalance());
}

export function useBalance() {
  const [b, setB] = useState(0);
  useEffect(() => {
    const sync = () => setB(getBalance());
    sync();
    if (!restored) {
      restored = true;
      void loadSettings();
      void syncPlayer().then(setServerBalance);
    }
    // Pull fresh server balance so referral bonus, refunds and admin changes appear instantly.
    if (!poller) {
      poller = setInterval(() => { if (document.visibilityState === "visible") void refreshBalance(); }, 8000);
      const onVis = () => { if (document.visibilityState === "visible") void refreshBalance(); };
      document.addEventListener("visibilitychange", onVis);
      window.addEventListener("focus", onVis);
    }
    window.addEventListener("lg-balance", sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("lg-balance", sync); window.removeEventListener("storage", sync); };
  }, []);
  return b;
}
