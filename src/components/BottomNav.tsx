import { Link } from "@tanstack/react-router";
import { Home, Trophy, Wallet, User, Gift } from "lucide-react";

const items = [
  { key: "home", to: "/", icon: Home, label: "Home" },
  { key: "leader", to: "/leaderboard", icon: Trophy, label: "Leader" },
  { key: "refer", to: "/refer", icon: Gift, label: "Refer" },
  { key: "withdraw", to: "/withdraw", icon: Wallet, label: "Withdraw" },
  { key: "profile", to: "/profile", icon: User, label: "Profile" },
] as const;

export type NavKey = (typeof items)[number]["key"];

export function BottomNav({ active }: { active: NavKey }) {
  return (
    <nav aria-label="Main navigation" className="fixed inset-x-3 bottom-3 z-20 mx-auto flex max-w-md items-center justify-between gap-1 rounded-full border bg-nav p-2 text-nav-foreground shadow-card backdrop-blur-xl">
      {items.map((n) => {
        const isActive = n.key === active;
        return (
          <Link
            key={n.key}
            to={n.to}
            aria-current={isActive ? "page" : undefined}
            className={`flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full transition-colors ${isActive ? "bg-nav-active" : "hover:bg-nav-active/50"}`}
          >
            {isActive ? (
              <div className="text-nav-foreground">
                <n.icon className="h-5 w-5" strokeWidth={2.5} />
              </div>
            ) : (
              <n.icon className="h-5 w-5" />
            )}
            <span className={`text-[9px] ${isActive ? "font-bold" : "font-medium"}`}>
              {n.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
