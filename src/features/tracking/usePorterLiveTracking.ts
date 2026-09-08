import * as React from "react";
import type { Order, OrderTrackingSnapshot } from "@/features/orders/models";

export interface TrackingStage {
  code: string;
  label: string;
  done: boolean;
  current: boolean;
}

export interface PorterLiveTracking {
  /** 0-based index into stages, -1 when cancelled/failed. */
  stageIndex: number;
  stages: TrackingStage[];
  cancelled: boolean;
  completed: boolean;
  /** Live GPS is not integrated: no coordinates are fabricated. */
  liveGpsAvailable: boolean;
  snapshot: OrderTrackingSnapshot | null;
}

const STAGE_DEFS = [
  { code: "ORDER_PLACED", label: "Order placed" },
  { code: "KITCHEN_PREPARING", label: "In the kitchen" },
  { code: "READY", label: "Ready / on its way" },
  { code: "DELIVERED", label: "Delivered" },
];

function stageIndexForStatus(code: string | undefined, terminal: boolean): number {
  if (!code) return 0;
  const c = code.toUpperCase();
  if (c.includes("CANCEL") || c.includes("FAIL") || c.includes("REJECT")) return -1;
  if (c.includes("DELIVER") || c.includes("COMPLETE") || c.includes("PICKED_UP")) return 3;
  if (c.includes("OUT_FOR") || c.includes("DISPATCH") || c.includes("RIDER") || c.includes("ON_THE_WAY") || c.includes("READY") || c.includes("SERV")) return 2;
  if (c.includes("PREPAR") || c.includes("KITCHEN") || c.includes("CONFIRM") || c.includes("ACCEPT") || c.includes("PROGRESS")) return 1;
  if (c.includes("PLACED") || c.includes("CREATED") || c.includes("PENDING") || c.includes("UPCOMING")) return 0;
  return terminal ? 3 : 0;
}

/**
 * usePorterLiveTracking — derives the tracker view-model from the order
 * status (+ optional polling snapshot). There is no live GPS feed, so
 * liveGpsAvailable is always false and no coordinates are invented.
 */
export function usePorterLiveTracking(
  order: Order | null,
  snapshot?: OrderTrackingSnapshot | null,
): PorterLiveTracking {
  return React.useMemo(() => {
    const status = snapshot?.status ?? order?.status;
    const idx = stageIndexForStatus(status?.code, status?.terminal ?? false);
    const cancelled = idx === -1;
    const completed = status?.terminal === true && !cancelled;
    const stages: TrackingStage[] = STAGE_DEFS.map((s, i) => ({
      ...s,
      done: !cancelled && i < idx,
      current: !cancelled && i === idx,
    }));
    return {
      stageIndex: idx,
      stages,
      cancelled,
      completed,
      liveGpsAvailable: false,
      snapshot: snapshot ?? null,
    };
  }, [order?.status, snapshot]);
}
