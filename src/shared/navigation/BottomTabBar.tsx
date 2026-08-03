import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, UtensilsCrossed, ShoppingBag, User, Ticket } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
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
  { to: "/home", label: "Home", Icon: Home, match: (p) => p === "/home" },
  { to: "/menu", label: "Menu", Icon: UtensilsCrossed, match: (p) => p.startsWith("/menu") },
  { to: "/offers", label: "Offers", Icon: Ticket, match: (p) => p.startsWith("/offers") },
  { to: "/cart", label: "Cart", Icon: ShoppingBag, match: (p) => p.startsWith("/cart") },
  { to: "/profile", label: "Profile", Icon: User, match: (p) => p.startsWith("/profile") },
];

/**
 * Floating branded bottom nav — deep-green pill, orange active pill,
 * subtle scale animation on tap.
 */
export function BottomTabBar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const hydrated = useHydrated();
  const cartCount = useCartStore(selectItemCount);
  const ios = isIOS();

  return (
    <div
      aria-hidden={false}
      className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[480px] md:max-w-[480px] max-md:max-w-full bg-white/95 backdrop-blur-xl border-t border-divider/60 shadow-[0_-4px_16px_rgba(0,0,0,0.02)] pb-[env(safe-area-inset-bottom,0px)]"
    >
      <nav aria-label="Primary" className="w-full">
        <ul className="grid grid-cols-5 py-2.5 px-1">
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
                    "group relative flex min-h-[48px] w-full flex-col items-center justify-center gap-1",
                    "transition-all duration-200 ease-out",
                    "active:scale-95",
                    active ? "text-accent" : "text-primary hover:text-primary/80",
                  )}
                >
                  <div className="relative">
                    {label === "Cart" ? (
                      <motion.div
                        key={`cart-icon-${cartCount}`}
                        animate={hydrated && cartCount > 0 ? { scale: [1, 1.2, 1] } : {}}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                      >
                        <Icon
                          className={cn(
                            "h-6 w-6 transition-transform",
                            active && !ios && "scale-105",
                          )}
                          aria-hidden
                        />
                      </motion.div>
                    ) : (
                      <Icon
                        className={cn(
                          "h-6 w-6 transition-transform",
                          active && !ios && "scale-105",
                        )}
                        aria-hidden
                      />
                    )}

                    <AnimatePresence mode="popLayout">
                      {showBadge && (
                        <motion.span
                          key={cartCount}
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.6, opacity: 0 }}
                          transition={{ type: "spring", stiffness: 600, damping: 20 }}
                          aria-label={`${cartCount} items in cart`}
                          className={cn(
                            "absolute -right-2.5 -top-1.5 grid h-4.5 min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-extrabold text-white",
                          )}
                        >
                          {cartCount}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>

                  <span
                    className={cn(
                      "text-[10px] tracking-wide transition-colors font-sans",
                      active
                        ? ios
                          ? "font-semibold text-accent"
                          : "font-bold text-accent"
                        : "font-medium text-primary/70",
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
