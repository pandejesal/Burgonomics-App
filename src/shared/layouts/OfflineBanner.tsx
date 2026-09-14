import * as React from "react";
import { WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAppConfig } from "@/core/state/appConfigStore";
import { useHydrated } from "@/shared/hooks/useHydrated";
import { useStoreSelection } from "@/features/stores/state/storeStore";

/**
 * OfflineBanner — persistent alert per Frontend Arch §22.
 *
 * Also emits a lightweight "Back online" toast when connectivity is
 * restored so screens dependent on repository data can visibly refresh
 * without any per-feature wiring.
 *
 * On reconnect the banner provably refreshes data: it invalidates every
 * React Query cache entry (forcing active queries to refetch) and reloads
 * the persisted store-selection state so the active store / fulfillment
 * reflect the latest server truth.
 */
export function OfflineBanner() {
  const hydrated = useHydrated();
  const online = useAppConfig((s) => s.isOnline);
  const wasOfflineRef = React.useRef(false);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!hydrated) return;
    if (!online) {
      wasOfflineRef.current = true;
    } else if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      toast.success("Back online", {
        description: "Refreshing latest content…",
      });
      // Real refresh, not toast-only: invalidate all queries so every
      // active query refetches, and reload the persisted store selection.
      void queryClient.invalidateQueries();
      void useStoreSelection.persist.rehydrate();
    }
  }, [hydrated, online, queryClient]);

  if (!hydrated || online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="relative z-30 flex items-center gap-2 bg-warning px-4 py-2 pt-[calc(0.5rem_+_env(safe-area-inset-top,0px))] text-warning-foreground type-caption animate-in fade-in slide-in-from-top-1 duration-200"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      <span>You are currently offline. Showing cached content. Checkout is disabled.</span>
    </div>
  );
}
