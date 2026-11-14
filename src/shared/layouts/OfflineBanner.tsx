import * as React from "react";
import { WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { selectObservedOffline, useAppConfig } from "@/core/state/appConfigStore";
import { useHydrated } from "@/shared/hooks/useHydrated";
import { useStoreSelection } from "@/features/stores/state/storeStore";

/**
 * OfflineBanner — persistent alert per Frontend Arch §22.
 *
 * Also emits a lightweight "Back online" toast when connectivity is
 * restored so screens dependent on repository data can visibly refresh
 * without any per-feature wiring.
 *
 * Both the banner and the recovery effects key off OBSERVED offline, not the
 * raw `isOnline` flag. A native cold start boots with `isOnline: false` while
 * connectivity is merely unconfirmed; treating that as a real disconnection
 * showed the banner on every launch and then fired the toast, a full query
 * invalidation and a store rehydrate on the first successful probe.
 *
 * On a genuine reconnect the banner provably refreshes data: it invalidates
 * every React Query cache entry (forcing active queries to refetch) and reloads
 * the persisted store-selection state so the active store / fulfillment
 * reflect the latest server truth.
 */
export function OfflineBanner() {
  const hydrated = useHydrated();
  const observedOffline = useAppConfig(selectObservedOffline);
  const wasOfflineRef = React.useRef(false);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!hydrated) return;
    if (observedOffline) {
      // Arm recovery only after a real offline period.
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
  }, [hydrated, observedOffline, queryClient]);

  if (!hydrated || !observedOffline) return null;
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
