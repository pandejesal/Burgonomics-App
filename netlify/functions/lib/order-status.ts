export type FulfillmentType = "delivery" | "takeaway" | "dinein";

export type KnownOrderStatusCode =
  | "PLACED"
  | "CONFIRMED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "PICKED_UP"
  | "READY_TO_SERVE"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

export type OrderStatusCode = KnownOrderStatusCode | (string & {});

export interface OrderStatusMeta {
  code: OrderStatusCode;
  label: string;
  kind: "upcoming" | "in_progress" | "completed" | "cancelled" | "failed" | "unknown";
  terminal: boolean;
}

export interface OrderTimelineStep {
  code: OrderStatusCode;
  title: string;
  description?: string;
  timestamp?: string;
  state: "completed" | "current" | "future";
}

export interface OrderState {
  id: string;
  fulfillment: FulfillmentType;
  status: OrderStatusMeta;
  placedAt: string;
  completedAt?: string;
  [key: string]: any;
}

export interface AdvanceOrderResult<T extends OrderState = OrderState> {
  order: T;
  advanced: boolean;
  timestamps: Record<string, string>;
}

export const STATUS_CATALOG: Record<string, Omit<OrderStatusMeta, "code">> = {
  PLACED: { label: "Order placed", kind: "upcoming", terminal: false },
  CONFIRMED: { label: "Order confirmed", kind: "upcoming", terminal: false },
  PREPARING: { label: "Preparing your order", kind: "in_progress", terminal: false },
  READY_FOR_PICKUP: { label: "Ready for pickup", kind: "in_progress", terminal: false },
  OUT_FOR_DELIVERY: { label: "Out for delivery", kind: "in_progress", terminal: false },
  DELIVERED: { label: "Delivered", kind: "completed", terminal: true },
  PICKED_UP: { label: "Picked up", kind: "completed", terminal: true },
  READY_TO_SERVE: { label: "Ready to serve", kind: "in_progress", terminal: false },
  COMPLETED: { label: "Completed", kind: "completed", terminal: true },
  CANCELLED: { label: "Cancelled", kind: "cancelled", terminal: true },
  FAILED: { label: "Failed", kind: "failed", terminal: true },
};

export function resolveStatus(code: OrderStatusCode): OrderStatusMeta {
  const known = STATUS_CATALOG[code as string];
  if (known) return { code, ...known };
  return { code, label: "Update in progress", kind: "unknown", terminal: false };
}

export const TIMELINE_RECIPES: Record<
  FulfillmentType,
  Array<{ code: OrderStatusCode; title: string; description?: string }>
> = {
  delivery: [
    { code: "PLACED", title: "Order confirmed", description: "We've received your order." },
    {
      code: "PREPARING",
      title: "Preparing",
      description: "Our chefs are cooking your order fresh.",
    },
    {
      code: "READY_FOR_PICKUP",
      title: "Ready for pickup",
      description: "Waiting for the delivery partner.",
    },
    {
      code: "OUT_FOR_DELIVERY",
      title: "Out for delivery",
      description: "On the way to your address.",
    },
    { code: "DELIVERED", title: "Delivered", description: "Enjoy your meal!" },
  ],
  takeaway: [
    { code: "PLACED", title: "Order confirmed", description: "We've received your order." },
    { code: "PREPARING", title: "Preparing", description: "Cooking your order fresh." },
    {
      code: "READY_FOR_PICKUP",
      title: "Ready for pickup",
      description: "Head to the counter with your pickup code.",
    },
    { code: "PICKED_UP", title: "Picked up", description: "Thanks for choosing Burgonomics." },
  ],
  dinein: [
    { code: "PLACED", title: "Order confirmed", description: "We've received your order." },
    { code: "PREPARING", title: "Preparing", description: "Your table is being served next." },
    {
      code: "READY_TO_SERVE",
      title: "Ready to serve",
      description: "Your order is on its way to the table.",
    },
    { code: "COMPLETED", title: "Completed", description: "Thanks for dining with us." },
  ],
};

export function nextStatusCode(
  fulfillment: FulfillmentType,
  current: OrderStatusCode,
): OrderStatusCode | null {
  const recipe = TIMELINE_RECIPES[fulfillment];
  if (!recipe) return null;
  const idx = recipe.findIndex((s) => s.code === current);
  if (idx < 0 || idx >= recipe.length - 1) return null;
  return recipe[idx + 1].code;
}

export function buildTimeline(
  fulfillment: FulfillmentType,
  currentCode: OrderStatusCode,
  timestamps: Partial<Record<OrderStatusCode, string>>,
): OrderTimelineStep[] {
  const recipe = TIMELINE_RECIPES[fulfillment] || [];
  const currentIdx = recipe.findIndex((s) => s.code === currentCode);
  return recipe.map((step, idx) => {
    const isCurrent = idx === currentIdx;
    const isCompleted = currentIdx >= 0 ? idx < currentIdx : false;
    return {
      code: step.code,
      title: step.title,
      description: step.description,
      timestamp: timestamps[step.code],
      state: isCompleted ? "completed" : isCurrent ? "current" : "future",
    };
  });
}

/**
 * Pure order status progression engine.
 * Given an order, an absolute timestamp or Date `now`, and existing timestamps map,
 * advances the order status deterministically according to fulfillment recipe steps.
 */
export function advanceOrder<T extends OrderState>(
  order: T,
  now: Date | number,
  existingTimestamps?: Record<string, string>,
  stepDurationSec: number = 30,
): AdvanceOrderResult<T> {
  const currentTimestamps: Record<string, string> = { ...(existingTimestamps || {}) };

  // Terminal states (completed, delivered, cancelled, failed) cannot advance
  if (order.status?.terminal) {
    return {
      order,
      advanced: false,
      timestamps: currentTimestamps,
    };
  }

  const recipe = TIMELINE_RECIPES[order.fulfillment];
  if (!recipe || recipe.length === 0) {
    return {
      order,
      advanced: false,
      timestamps: currentTimestamps,
    };
  }

  const nowMs = typeof now === "number" ? now : now.getTime();
  const placedAtMs = new Date(order.placedAt).getTime();
  if (Number.isNaN(placedAtMs)) {
    return {
      order,
      advanced: false,
      timestamps: currentTimestamps,
    };
  }

  const elapsedSec = Math.max(0, (nowMs - placedAtMs) / 1000);
  const stepsForward = Math.floor(elapsedSec / stepDurationSec);

  const currentIdx = recipe.findIndex((s) => s.code === order.status.code);
  const targetIdx = Math.min(
    recipe.length - 1,
    Math.max(currentIdx >= 0 ? currentIdx : 0, stepsForward),
  );

  if (targetIdx === currentIdx) {
    return {
      order,
      advanced: false,
      timestamps: currentTimestamps,
    };
  }

  for (let i = Math.max(0, currentIdx + 1); i <= targetIdx; i++) {
    const code = recipe[i].code;
    if (!currentTimestamps[code]) {
      currentTimestamps[code] = new Date(placedAtMs + i * stepDurationSec * 1000).toISOString();
    }
  }

  const newCode = recipe[targetIdx].code;
  const newStatus = resolveStatus(newCode);

  const updatedOrder: T = {
    ...order,
    status: newStatus,
    completedAt: newStatus.terminal ? currentTimestamps[newCode] : undefined,
  };

  return {
    order: updatedOrder,
    advanced: true,
    timestamps: currentTimestamps,
  };
}
