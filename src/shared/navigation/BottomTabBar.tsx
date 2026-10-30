import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, UtensilsCrossed, ShoppingBag, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCartStore, selectItemCount } from "@/features/cart/state/cartStore";
import { useHydrated } from "@/shared/hooks/useHydrated";
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
 * Inset floating bottom nav: a solid surface bar, modest 16px radius, one
 * restrained shadow, 8px above the safe area.
 *
 * Deliberately not glass: no backdrop blur and no translucent fill, so the bar
 * reads as an object above the page rather than a pane of the page. The active
 * tab is carried by colour and weight only — no full-width indicator rule.
 */
export function BottomTabBar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const hydrated = useHydrated();
  const cartCount = useCartStore(selectItemCount);
  const navRef = React.useRef<HTMLElement>(null);

  // Publish the real rendered height so the content padding and the floating
  // cart bar clear this bar without hard-coded assumptions. The min-height is
  // in rem, so at 200% text the bar grows and this follows it.
  React.useEffect(() => {
    const el = navRef.current;
    if (!el || typeof document === "undefined") return;
    const root = document.documentElement;
    const apply = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      if (height <= 0) return;
      root.style.setProperty("--bottom-nav-height", `${height}px`);
      // Height plus the 8px gap below it plus 8px of clearance above it.
      root.style.setProperty("--bottom-nav-offset", `${height + 16}px`);
    };
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[480px] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+8px)]">
      <nav
        ref={navRef}
        aria-label="Primary"
        className="pointer-events-auto rounded-2xl border border-border bg-surface shadow-medium"
      >
        <ul className="grid grid-cols-4 px-1 py-1.5">
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
                    "group relative flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5",
                    "transition-colors duration-200 ease-out",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    active ? "text-primary dark:text-primary-text" : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  <div className="relative">
                    <Icon
                      className={cn("h-5 w-5 transition-transform", active && "scale-105 stroke-[2.5px]")}
                      aria-hidden
                    />

                    {showBadge && (
                      <span
                        key={cartCount}
                        aria-label={`${cartCount} items in cart`}
                        className={cn(
                          "absolute -right-3 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-xs font-semibold leading-none text-accent-foreground shadow-sm",
                          "animate-[tabBadgePop_0.25s_ease-out]",
                        )}
                      >
                        {cartCount}
                      </span>
                    )}
                  </div>

                  <span
                    className={cn(
                      "type-label-medium tracking-normal transition-colors",
                      active ? "font-semibold" : "font-medium",
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
