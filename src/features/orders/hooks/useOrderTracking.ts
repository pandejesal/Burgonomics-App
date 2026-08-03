/**
 * useOrderTracking — subscribe to repository-driven tracking updates
 * for a single order. Screens never manage timers themselves; the
 * repository owns the transport (polling today, WS/push tomorrow).
 */
import * as React from "react";
import type { OrderTrackingSnapshot } from "@/features/orders/models";
import { orderRepository } from "@/features/orders/repositories/OrderRepository";

export type TrackingUiState =
  | { status: "loading"; snapshot: null; error: null }
  | { status: "tracking"; snapshot: OrderTrackingSnapshot; error: null }
  | { status: "refreshing"; snapshot: OrderTrackingSnapshot; error: null }
  | { status: "completed"; snapshot: OrderTrackingSnapshot; error: null }
  | { status: "cancelled"; snapshot: OrderTrackingSnapshot; error: null }
  | { status: "error"; snapshot: OrderTrackingSnapshot | null; error: string }
  | { status: "offline"; snapshot: OrderTrackingSnapshot | null; error: null };

export function useOrderTracking(
  orderId: string | null | undefined,
  opts: { intervalMs?: number } = {},
) {
  const [state, setState] = React.useState<TrackingUiState>({
    status: "loading",
    snapshot: null,
    error: null,
  });

  React.useEffect(() => {
    if (!orderId) return;
    setState({ status: "loading", snapshot: null, error: null });

    const sub = orderRepository.subscribeTracking(
      orderId,
      (snap) => {
        setState({
          status:
            snap.status.kind === "cancelled" || snap.status.kind === "failed"
              ? "cancelled"
              : snap.status.terminal
                ? "completed"
                : "tracking",
          snapshot: snap,
          error: null,
        });
      },
      {
        intervalMs: opts.intervalMs,
        onError: (e) => {
          setState((prev) => ({
            status: "error",
            snapshot: prev.snapshot,
            error: e.message,
          }));
        },
      },
    );

    // React to network status changes so the UI can show offline state.
    const goOffline = () =>
      setState((prev) => ({ status: "offline", snapshot: prev.snapshot, error: null }));
    const goOnline = () => void sub.refresh();
    if (typeof window !== "undefined") {
      window.addEventListener("offline", goOffline);
      window.addEventListener("online", goOnline);
    }

    return () => {
      sub.stop();
      if (typeof window !== "undefined") {
        window.removeEventListener("offline", goOffline);
        window.removeEventListener("online", goOnline);
      }
    };
  }, [orderId, opts.intervalMs]);

  const refresh = React.useCallback(async () => {
    if (!orderId) return;
    setState((prev) =>
      prev.snapshot ? { status: "refreshing", snapshot: prev.snapshot, error: null } : prev,
    );
    const res = await orderRepository.getTracking(orderId);
    if (res.success && res.data) {
      setState({
        status: res.data.status.terminal
          ? res.data.status.kind === "cancelled"
            ? "cancelled"
            : "completed"
          : "tracking",
        snapshot: res.data,
        error: null,
      });
    } else if (!res.success) {
      setState((prev) => ({
        status: "error",
        snapshot: prev.snapshot,
        error: res.error.message,
      }));
    }
  }, [orderId]);

  return { ...state, refresh } as const;
}
