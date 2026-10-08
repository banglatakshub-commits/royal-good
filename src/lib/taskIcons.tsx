import type { ReactNode } from "react";
import {
  Youtube,
  Facebook,
  Instagram,
  Globe,
  Star,
  Music2,
  Send,
  MessageCircle,
  Twitter,
  Gamepad2,
  ShoppingBag,
  Camera,
} from "lucide-react";

// Brand logo options for custom tasks. Stored in custom_tasks.icon as a key.
export const TASK_ICON_OPTIONS: { key: string; label: string }[] = [
  { key: "telegram", label: "Telegram" },
  { key: "facebook", label: "Facebook" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "instagram", label: "Instagram" },
  { key: "x", label: "X (Twitter)" },
  { key: "game", label: "Game" },
  { key: "shop", label: "Shop" },
  { key: "camera", label: "Photo" },
  { key: "music", label: "Music" },
  { key: "web", label: "Website" },
  { key: "star", label: "অন্যান্য" },
];

const BRAND_COLORS: Record<string, string> = {
  telegram: "#229ED9",
  facebook: "#1877F2",
  tiktok: "#111111",
  youtube: "#FF0000",
  whatsapp: "#25D366",
  instagram: "#E1306C",
  x: "#111111",
  game: "#7C3AED",
  shop: "#F59E0B",
  camera: "#EC4899",
  music: "#10B981",
  web: "#3B82F6",
  star: "#EAB308",
};

export function TaskIcon({ icon, size = 20 }: { icon: string; size?: number }) {
  // Legacy emoji values still render as emoji.
  if (!BRAND_COLORS[icon]) return <span style={{ fontSize: size }}>{icon || "⭐"}</span>;
  const color = BRAND_COLORS[icon];
  const cls = "shrink-0";
  let node: ReactNode;
  switch (icon) {
    case "telegram":
      node = <Send size={size} className={cls} style={{ color }} />;
      break;
    case "facebook":
      node = <Facebook size={size} className={cls} style={{ color }} />;
      break;
    case "tiktok":
      node = <Music2 size={size} className={cls} style={{ color }} />;
      break;
    case "youtube":
      node = <Youtube size={size} className={cls} style={{ color }} />;
      break;
    case "whatsapp":
      node = <MessageCircle size={size} className={cls} style={{ color }} />;
      break;
    case "instagram":
      node = <Instagram size={size} className={cls} style={{ color }} />;
      break;
    case "x":
      node = <Twitter size={size} className={cls} style={{ color }} />;
      break;
    case "game":
      node = <Gamepad2 size={size} className={cls} style={{ color }} />;
      break;
    case "shop":
      node = <ShoppingBag size={size} className={cls} style={{ color }} />;
      break;
    case "camera":
      node = <Camera size={size} className={cls} style={{ color }} />;
      break;
    case "music":
      node = <Music2 size={size} className={cls} style={{ color }} />;
      break;
    case "web":
      node = <Globe size={size} className={cls} style={{ color }} />;
      break;
    default:
      node = <Star size={size} className={cls} style={{ color }} />;
  }
  return node;
}
