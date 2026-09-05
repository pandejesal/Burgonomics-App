import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, UtensilsCrossed, ShoppingBag, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCartStore, selectItemCount } from "@/features/cart/state/cartStore";
import { useHydrated } from "@/shared/hooks/useHydrated";
import { isIOS } from "@/shared/platform/platform";
import { HapticService } from "@/core/services/haptics";

interface Tab {
  to: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  match: (path: string) => boolean;
}

const TABS: Tab[] = [
  { to: "/home", label: "Home", Icon: Home, match: (p) => p === "/home" || p === "/" },
  { to: "/menu", label: "Menu", Icon: UtensilsCrossed, match: (p) => p.startsWith("/menu") },
  { to: "/cart", label: "Cart", Icon: ShoppingBag, match: (p) => p.startsWith("/cart") },
  { to: "/profile", label: "Profile", Icon: User, match: (p) => p.startsWith("/profile") },
];

/**
 * Floating branded bottom nav — La Pino'z 4-tab bar with Forest Green active anchor,
 * subtle top indicator, and vibrant orange cart badge.
 */
export function BottomTabBar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const hydrated = useHydrated();
  const cartCount = useCartStore(selectItemCount);
  const ios = isIOS();

  return (
    <div
      aria-hidden={false}
      className="glass-panel fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[480px] md:max-w-[480px] max-md:max-w-full shadow-high pb-[env(safe-area-inset-bottom,0px)] bg-surface/95 backdrop-blur-md border-t border-border"
    >
      <nav aria-label="Primary" className="w-full">
        <ul className="grid grid-cols-4 py-2 px-2">
          {TABS.map(({ to, label, Icon, match }) => {
            const active = match(path);
            const showBadge = label === "Cart" && hydrated && cartCount > 0;
            return (
              <li key={to} className="flex justify-center">
                <Link
                  to={to}
                  onClick={() => {
                    void HapticService.selection();
                  }}
                  aria-current={active ? "page" : undefined}
                  aria-label={label}
                  className={cn(
                    "group relative flex min-h-[50px] w-full flex-col items-center justify-center gap-1",
                    "transition-all duration-200 ease-out",
                    "active:scale-95",
                    active ? "text-primary dark:text-primary-text" : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  {/* Top active indicator line (CSS transition — the shared
                      shell must not pull motion into every page's chunk). */}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -top-2 inset-x-4 h-1 rounded-full bg-primary dark:bg-primary-text transition-all duration-200 ease-out",
                      active ? "opacity-100 scale-x-100" : "opacity-0 scale-x-50",
                    )}
                  />

                  <div className="relative">
                    <Icon
                      className={cn(
                        "h-5.5 w-5.5 transition-transform",
                        active && "scale-105 stroke-[2.5px]",
                      )}
                      aria-hidden
                    />

                    {showBadge && (
                      <span
                        key={cartCount}
                        aria-label={`${cartCount} items in cart`}
                        className={cn(
                          "absolute -right-2.5 -top-1.5 grid h-4.5 min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-extrabold text-accent-foreground shadow-sm",
                          "animate-[tabBadgePop_0.25s_ease-out]",
                        )}
                      >
                        {cartCount}
                      </span>
                    )}
                  </div>

                  <span
                    className={cn(
                      "text-[11px] tracking-tight transition-colors font-sans",
                      active
                        ? "font-bold text-primary dark:text-primary-text"
                        : "font-medium text-text-secondary",
                    )}
                  >
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
