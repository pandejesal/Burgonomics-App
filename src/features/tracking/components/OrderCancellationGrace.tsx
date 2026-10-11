import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Timer, XCircle, Phone, MessageCircle } from "lucide-react";

import type { Order } from "@/features/orders/models";
import { ordersService } from "@/features/orders/services/ordersService";
import { isSafeTelNumber } from "@/shared/utils/urlSafety";

/** Free-cancellation window (seconds) after an order is placed. */
const GRACE_SECONDS = 60;

interface OrderCancellationGraceProps {
  order: Order;
  onCancelled?: () => void;
}

/** Whole seconds elapsed since an ISO timestamp; 0 when unparseable. */
function secondsSince(iso?: string): number {
  if (!iso) return 0;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return 0;
  return Math.max(0, Math.floor((Date.now() - at) / 1000));
}

/** Lowercased status code — codes are opaque (`string & {}`) so we match loosely. */
function statusIs(order: Order, ...codes: string[]): boolean {
  const code = (order.status?.code ?? "").toLowerCase();
  return codes.includes(code);
}

/** Digits only, with a 10-digit Indian local number lifted to E.164 `91…`. */
function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function OrderCancellationGrace({ order, onCancelled }: OrderCancellationGraceProps) {
  // 1. Ticking elapsed-seconds counter, anchored on placedAt (createdAt fallback).
  const anchoredAt = useMemo(() => {
    const fallback = (order as Order & { createdAt?: string }).createdAt;
    return order.placedAt || fallback;
  }, [order.placedAt, order]);

  const [elapsed, setElapsed] = useState(() => secondsSince(anchoredAt));
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    setElapsed(secondsSince(anchoredAt));
    const id = window.setInterval(() => setElapsed(secondsSince(anchoredAt)), 1000);
    return () => window.clearInterval(id);
  }, [anchoredAt]);

  const remaining = Math.max(0, GRACE_SECONDS - elapsed);

  const cancellableStatus = statusIs(order, "placed", "pending");
  const supportStatus = statusIs(order, "preparing", "accepted", "confirmed");

  // 2. Inside the grace window on a still-cancellable status → countdown banner.
  const showCountdown = cancellableStatus && remaining > 0;

  const handleCancel = useCallback(async () => {
    if (isCancelling) return;
    setIsCancelling(true);
    try {
      const res = await ordersService.cancelOrder(order.id);
      if (!res.success) {
        toast.error(res.error.message || "Could not cancel the order. Please call the store.");
        return;
      }
      toast.success("Order cancelled. Instant refund initiated.");
      onCancelled?.();
    } catch {
      toast.error("Could not cancel the order. Please call the store.");
    } finally {
      setIsCancelling(false);
    }
  }, [isCancelling, order.id, onCancelled]);

  // 3. Window closed (or kitchen already accepted) → help / support CTAs.
  const showSupport = !showCountdown && (remaining === 0 || supportStatus || !cancellableStatus);

  const storePhone = order.store?.phone?.trim() ?? "";
  const canCall = isSafeTelNumber(storePhone);
  const waNumber = canCall ? toWhatsAppNumber(storePhone) : "";
  const waHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(
        `Hi, I need help with my order ${order.shortCode || order.id}.`,
      )}`
    : undefined;

  // Terminal states where neither cancel nor "cancellation?" copy applies.
  // (Guard placed after all hooks to keep hook order stable across renders.)
  if (order.status?.terminal && statusIs(order, "cancelled", "failed")) return null;

  if (showCountdown) {
    const pct = Math.round((remaining / GRACE_SECONDS) * 100);
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-3xl border border-divider bg-surface p-4 text-text shadow-md space-y-3"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-[#0E4825] border border-emerald-500/40 text-emerald-300 motion-safe:animate-pulse">
              <Timer className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="block font-bold text-xs text-text">
                Free cancellation for{" "}
                <span className="font-black tabular-nums">
                  0:{String(remaining).padStart(2, "0")}
                </span>{" "}
                more
              </span>
              <span className="block text-[11px] text-text-secondary">
                Cancel now for an instant refund — no questions asked.
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCancel}
            disabled={isCancelling}
            aria-busy={isCancelling}
            className="shrink-0 py-2.5 px-3.5 rounded-xl bg-[#0E4825] hover:bg-[#135d30] disabled:opacity-60 border border-emerald-500/40 text-emerald-300 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer disabled:cursor-wait"
          >
            <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isCancelling ? "Cancelling…" : "Cancel Order"}</span>
          </button>
        </div>

        {/* Animated grace-window progress bar. */}
        <div
          className="h-1.5 w-full rounded-full bg-bg-secondary border border-divider overflow-hidden"
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400 transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  if (showSupport) {
    return (
      <div className="rounded-3xl border border-divider bg-surface p-4 text-text shadow-md space-y-3">
        <span className="block font-bold text-xs text-text">Need help or cancellation?</span>
        <span className="block text-[11px] text-text-secondary">
          The free-cancellation window has closed — our team can still assist you.
        </span>

        <div className="flex items-center gap-2 pt-1 border-t border-divider">
          {canCall ? (
            <a
              href={`tel:${storePhone}`}
              className="flex-1 py-2.5 rounded-xl bg-surface hover:bg-bg-secondary border border-divider text-text font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <Phone className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" aria-hidden="true" />
              <span>Call Store</span>
            </a>
          ) : (
            <span className="flex-1 text-text-secondary italic text-[11px] text-center">
              Store phone unavailable
            </span>
          )}

          {waHref ? (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2.5 rounded-xl bg-surface hover:bg-bg-secondary border border-divider text-text font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" aria-hidden="true" />
              <span>WhatsApp Support</span>
            </a>
          ) : (
            <span className="flex-1 text-text-secondary italic text-[11px] text-center">
              WhatsApp unavailable
            </span>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export default OrderCancellationGrace;
