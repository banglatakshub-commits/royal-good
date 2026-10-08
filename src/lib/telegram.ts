export function getTgUser(): { name: string; username: string; photo: string | null; id?: number } {
  if (typeof window === "undefined") return { name: "Soikot Islam", username: "soikot", photo: null };
  const u = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
  if (!u) return { name: "Soikot Islam", username: "soikot", photo: null };
  return {
    name: [u.first_name, u.last_name].filter(Boolean).join(" ") || "User",
    username: u.username ?? String(u.id),
    photo: u.photo_url ?? null,
    id: u.id,
  };
}
