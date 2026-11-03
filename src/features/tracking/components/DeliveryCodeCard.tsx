import * as React from "react";
import { selectIsAuthenticated, useAuthStore } from "@/features/auth/state/authStore";
import type { Order } from "@/features/orders/models";
import { retrieveDeliveryCode } from "../services/deliveryCodeService";

const ACTIVE_DELIVERY_STATUSES = new Set([
  "CONFIRMED", "ACCEPTED", "PREPARING", "READY", "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY", "IN_TRANSIT",
]);

/** Backend refuses "not_requested"; it allows a partial refund to coexist. */
function hasRefundSignal(value: string | undefined): boolean {
  return !!value && !["none", "not_requested", "partially_refunded"].includes(value.toLowerCase());
}

/** Eligibility is a display gate, never payment/ownership proof; the endpoint rechecks both. */
export function DeliveryCodeCard({ order, orderId }: { order: Order; orderId: string }) {
  const uid = useAuthStore((s) => selectIsAuthenticated(s) ? s.user?.id : null);
  const eligible = order.id === orderId && order.fulfillment === "delivery" &&
    order.payment?.status === "paid" && order.status?.terminal === false &&
    ACTIVE_DELIVERY_STATUSES.has(order.status.code?.toUpperCase()) &&
    !["completed", "cancelled", "failed"].includes(order.status.kind) &&
    !order.deliveryOtpConsumedAt && !order.refundActiveClaim && !order.refundClaimedAt &&
    !hasRefundSignal(order.refundStatus) && !hasRefundSignal(order.payment?.refundStatus) &&
    !order.reconciliation &&
    // Backend also refuses once the courier lifecycle says the delivery is
    // over, even if the coarse status code is still OUT_FOR_DELIVERY.
    !["delivered", "cancelled", "canceled", "cancelling", "refunded"].includes(
      (order.deliveryStatus ?? "").toLowerCase(),
    ) &&
    !order.deliveredAt && !order.cancelledAt &&
    !order.cancellationStatus;

  // Key BOTH identities: a new account viewing the same order must never inherit a code.
  // Removing the child also clears its memory synchronously for every ineligible render.
  return uid && eligible
    ? <DeliveryCodeSession key={JSON.stringify([uid, orderId])} uid={uid} orderId={orderId} />
    : null;
}

type CodeState =
  | { status: "loading" }
  | { status: "ready"; code: string }
  | { status: "error"; legacy: boolean; retryable: boolean };

function DeliveryCodeSession({ uid, orderId }: { uid: string; orderId: string }) {
  const [attempt, setAttempt] = React.useState(0);
  const [state, setState] = React.useState<CodeState>({ status: "loading" });
  const warningId = React.useId();

  React.useEffect(() => {
    const controller = new AbortController();
    let ignored = false;
    setState({ status: "loading" });
    void retrieveDeliveryCode(orderId, uid, controller.signal).then((result) => {
      if (ignored || controller.signal.aborted) return;
      setState(result.success
        ? { status: "ready", code: result.data.deliveryOtp }
        : { status: "error", legacy: result.error.code === "LEGACY_OTP_UNAVAILABLE", retryable: result.error.retryable === true });
    }).catch(() => {
      if (!ignored) setState({ status: "error", legacy: false, retryable: true });
    });
    return () => {
      ignored = true;
      controller.abort();
    };
  }, [uid, orderId, attempt]);

  return (
    <section aria-label="Delivery code" className="space-y-3 rounded-3xl border border-divider bg-surface p-5">
      <h2 className="type-title-large text-text">Delivery code</h2>
      <p id={warningId} className="text-sm leading-relaxed text-text-secondary">
        Only share this code when your food arrives. Sharing it confirms delivery.
      </p>
      {state.status === "ready" ? (
        <p data-sensitive="delivery-code" aria-label={`Delivery handover code: ${state.code.split("").join(" ")}`} aria-describedby={warningId} className="select-text text-3xl font-semibold tracking-widest tabular-nums text-text">
          {state.code}
        </p>
      ) : (
        <p role={state.status === "error" ? "alert" : "status"} className="text-sm leading-relaxed text-text-secondary">
          {state.status === "loading" ? "Loading delivery code…" : state.legacy
            ? "The code for this older order can't be reopened. Contact the store for help with delivery."
            : "We couldn't load the delivery code. No code is shown until it is confirmed."}
        </p>
      )}
      {state.status === "error" && state.retryable && attempt < 2 && (
        <button type="button" onClick={() => { setState({ status: "loading" }); setAttempt((value) => value + 1); }} className="min-h-11 min-w-11 cursor-pointer rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface">
          Retry delivery code
        </button>
      )}
    </section>
  );
}
