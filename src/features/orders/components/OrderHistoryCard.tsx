import React, { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  RotateCcw,
  Navigation,
  FileText,
  Star,
  ChevronRight,
  Clock,
  Store,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { formatINR } from "@/core/utils/format";
import { InvoiceDownloadButton } from "./InvoiceDownloadButton";
import { ReorderDialogs } from "./ReorderDialogs";
import { useReorderItems } from "../hooks/useReorderItems";
import type { Order } from "../models";

interface OrderHistoryCardProps {
  order: Order;
}

const RATING_TAGS = ["Hot & Fresh", "Crispy Buns", "Fast Delivery", "Great Packaging"];

export function OrderHistoryCard({ order }: OrderHistoryCardProps) {
  const navigate = useNavigate();
  const {
    reorder,
    isReordering,
    outOfStockModal,
    confirmReorderRemaining,
    dismissOutOfStockModal,
    pendingConfirmation,
    confirmPendingReorder,
    cancelPendingReorder,
  } = useReorderItems();

  // Ratings have no backend yet: persist on-device so a submitted rating
  // survives reload, and say so honestly — never "Thank you, the store got
  // it" theater for feedback that evaporates.
  const ratingKey = `burgonomics.ratings.${order.id}`;
  const readSavedRating = (): { stars: number; tags: string[] } | null => {
    try {
      const raw = localStorage.getItem(ratingKey);
      return raw ? (JSON.parse(raw) as { stars: number; tags: string[] }) : null;
    } catch {
      return null;
    }
  };
  const savedRating = readSavedRating();
  const [rating, setRating] = useState<number | null>(savedRating?.stars ?? null);
  const [selectedTags, setSelectedTags] = useState<string[]>(savedRating?.tags ?? []);
  const [ratingSubmitted, setRatingSubmitted] = useState(savedRating !== null);

  const shortCode = order.shortCode || order.id.slice(-6).toUpperCase();
  const isTerminal = order.status.terminal || order.status.kind === "completed" || order.status.kind === "cancelled";
  const isCancelled = order.status.kind === "cancelled" || order.status.code.includes("CANCEL");

  const dateFormatted = new Date(order.placedAt || Date.now()).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const handleRate = (stars: number) => {
    setRating(stars);
  };

  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSaveRating = () => {
    if (!rating) return;
    try {
      localStorage.setItem(ratingKey, JSON.stringify({ stars: rating, tags: selectedTags }));
    } catch {
      // Private mode: still show submitted for this view.
    }
    setRatingSubmitted(true);
  };

  return (
    <div className="space-y-5 rounded-[var(--radius-large)] border border-divider bg-surface p-4 transition-colors sm:p-5">
      {/* Header: Order #, Store Name, Status Badge */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-divider pb-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="type-price text-base text-text-primary">#{shortCode}</span>
            <span
              className={`rounded-full border px-2.5 py-1 type-caption font-medium ${
                isCancelled
                  ? "border-error/30 bg-error/10 text-error"
                  : isTerminal
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-warning/30 bg-warning/10 text-warning"
              }`}
            >
              {order.status.label || order.status.code}
            </span>
          </div>

          <p className="mt-2 flex flex-wrap items-center gap-1 type-caption text-text-secondary">
            <Store className="h-4 w-4 shrink-0" aria-hidden />
            <span>{order.store?.name || "Burgonomics Outlet"}</span>
            <span>•</span>
            <Clock className="h-4 w-4 shrink-0" aria-hidden />
            <span>{dateFormatted}</span>
          </p>
        </div>

        <div className="shrink-0 text-right">
          <span className="type-price whitespace-nowrap text-base text-text-primary">
            {formatINR(order.totals?.grandTotal || 0)}
          </span>
          <span className="block type-caption text-text-secondary">
            {order.fulfillment} • {order.payment?.method || "Payment method unavailable"}
          </span>
        </div>
      </div>

      {/* Item Summary Checklist */}
      <div className="space-y-2.5 type-caption text-text-secondary">
        {order.items?.map((item, idx) => (
          <div key={idx} className="flex items-start justify-between gap-3">
            <span className="min-w-0 flex-1 break-words">
              {item.quantity}x {item.name}
            </span>
            <span className="type-price shrink-0 whitespace-nowrap text-text-primary">
              {formatINR((item.unitPrice || 0) * (item.quantity || 1))}
            </span>
          </div>
        ))}
      </div>

      {/* Post-Order 5-Star Rating Box (Completed Orders) */}
      {isTerminal && !isCancelled && !ratingSubmitted && (
        <div className="p-3.5 rounded-2xl bg-bg-secondary border border-divider space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 type-body font-medium text-text-primary">
              <Sparkles className="h-4 w-4 text-accent-text" aria-hidden />
              <span>How was your meal?</span>
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  aria-label={`Rate ${star} out of 5`}
                  aria-pressed={rating === star}
                  onClick={() => handleRate(star)}
                  className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-text-secondary transition-colors hover:text-accent-text"
                >
                  <Star
                    aria-hidden
                    className={`h-5 w-5 ${
                      rating && rating >= star ? "text-accent-text fill-current" : ""
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {rating && (
            <div className="space-y-3 border-t border-divider pt-3 animate-in fade-in duration-200">
              <div className="flex flex-wrap gap-1.5">
                {RATING_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={selectedTags.includes(tag)}
                    onClick={() => handleToggleTag(tag)}
                    className={`min-h-11 cursor-pointer rounded-full border px-3 type-caption font-medium transition-colors ${
                      selectedTags.includes(tag)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-bg-secondary border-divider text-text-secondary hover:text-text"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleSaveRating}
                className="min-h-11 w-full cursor-pointer rounded-full bg-primary px-4 py-2 type-button-sm text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                Submit Review
              </button>
            </div>
          )}
        </div>
      )}

      {ratingSubmitted && (
        <div className="flex items-start gap-2 rounded-[var(--radius-medium)] border border-success/30 bg-success/10 p-3 type-caption text-success">
          <CheckCircle2 className="w-4 h-4" />
          <span>Thanks — your rating is saved on this device.</span>
        </div>
      )}

      {/* Action Buttons: 1-Tap Reorder, Track, Invoice */}
      <div className="flex flex-wrap items-center gap-3 border-t border-divider pt-4">
        {!isTerminal ? (
          <button
            type="button"
            onClick={() => void navigate({ to: `/orders/${order.id}/track` as any })}
            className="flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 type-button-sm text-primary-foreground transition-colors hover:bg-primary-hover active:scale-[0.98]"
          >
            <Navigation className="w-3.5 h-3.5" />
            {/* A courier only exists for delivery orders — never promise GPS
                on dine-in/takeaway (O-09). The track screen gates its rider
                pin the same way, on real backend GPS. */}
            <span>
              {order.fulfillment === "delivery" ? "Track delivery" : "View Order Status"}
            </span>
          </button>
        ) : (
          <button
            type="button"
            disabled={isReordering}
            onClick={() => void reorder(order)}
            className="flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 type-button-sm text-primary-foreground transition-colors hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isReordering ? "animate-spin" : ""}`} />
            <span>{isReordering ? "Adding..." : "Reorder"}</span>
          </button>
        )}

        <InvoiceDownloadButton order={order} />
      </div>

      {/* Reorder review: unavailable items, price changes, outlet replacement.
          Both are review-only until the customer confirms. */}
      <ReorderDialogs
        outOfStockModal={outOfStockModal}
        pendingConfirmation={pendingConfirmation}
        busy={isReordering}
        onConfirmRemaining={() => void confirmReorderRemaining()}
        onDismissOutOfStock={dismissOutOfStockModal}
        onConfirm={() => void confirmPendingReorder()}
        onCancel={cancelPendingReorder}
      />
    </div>
  );
}

export default OrderHistoryCard;
