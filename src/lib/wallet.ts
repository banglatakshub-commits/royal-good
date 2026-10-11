import { useEffect, useState } from "react";
import { fetchMyBalance, syncPlayer } from "@/lib/players";
import { loadSettings } from "@/lib/settings";
import { getTgIdentity } from "@/lib/telegram";

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
  if (typeof window === "undefined" || typeof next !== "number" || !Number.isFinite(next)) return;
  localStorage.setItem(KEY, String(next));
  window.dispatchEvent(new Event("lg-balance"));
}

export async function refreshBalance() {
  const balance = await fetchMyBalance({ data: getTgIdentity() });
  setServerBalance(balance);
}

export function useBalance() {
  const [balance, setBalance] = useState(0);
  useEffect(() => {
    const sync = () => setBalance(getBalance());
    sync();
    if (!restored) {
      restored = true;
      void loadSettings();
      void syncPlayer({ data: getTgIdentity() })
        .then((result) => setServerBalance(result.balance))
        .catch((error: unknown) => console.error("Profile sync error:", error));
    }
    // Pull fresh server balance so referral bonuses, refunds and admin changes appear promptly.
    if (!poller) {
      poller = setInterval(() => {
        if (document.visibilityState === "visible") void refreshBalance().catch(() => {});
      }, 8000);
      const onVisibility = () => {
        if (document.visibilityState === "visible") void refreshBalance().catch(() => {});
      };
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("focus", onVisibility);
    }
    window.addEventListener("lg-balance", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("lg-balance", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return balance;
}
