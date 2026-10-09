type MiniAppUser = {
  id?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  username?: unknown;
  photo_url?: unknown;
};

type MiniAppWindow = Window & {
  Telegram?: {
    WebApp?: {
      initData?: string;
      initDataUnsafe?: { user?: MiniAppUser; start_param?: string };
    };
  };
};

export type TelegramProfile = {
  name: string;
  username: string;
  photo: string | null;
  id?: number;
};

export function getTgUser(): TelegramProfile {
  if (typeof window === "undefined") {
    return { name: "Soikot Islam", username: "soikot", photo: null };
  }

  const user = (window as MiniAppWindow).Telegram?.WebApp?.initDataUnsafe?.user;
  if (!user || typeof user.id !== "number") {
    return { name: "Soikot Islam", username: "soikot", photo: null };
  }

  return {
    name:
      [user.first_name, user.last_name]
        .filter((part): part is string => typeof part === "string" && part.length > 0)
        .join(" ") || "User",
    username:
      typeof user.username === "string" && user.username.length > 0
        ? user.username
        : String(user.id),
    photo: typeof user.photo_url === "string" ? user.photo_url : null,
    id: user.id,
  };
}

/** Identity payload sent to server functions; initData is signed by Telegram. */
export function getTgIdentity() {
  const user = getTgUser();
  if (typeof window === "undefined") {
    return {
      initData: "",
      tgId: user.id ? String(user.id) : user.username,
      name: user.name,
      username: user.username,
      photo: user.photo,
    };
  }

  const webApp = (window as MiniAppWindow).Telegram?.WebApp;
  return {
    initData: webApp?.initData ?? "",
    tgId: user.id ? String(user.id) : user.username,
    name: user.name,
    username: user.username,
    photo: user.photo,
  };
}

export function getTgId(): string {
  return getTgIdentity().tgId;
}
