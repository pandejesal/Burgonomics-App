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
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { formatINR } from "@/core/utils/format";
import { InvoiceDownloadButton } from "./InvoiceDownloadButton";
import { useReorderItems } from "../hooks/useReorderItems";
import type { Order } from "../models";

interface OrderHistoryCardProps {
  order: Order;
}

const RATING_TAGS = ["Hot & Fresh", "Crispy Buns", "Fast Delivery", "Great Packaging"];

export function OrderHistoryCard({ order }: OrderHistoryCardProps) {
  const navigate = useNavigate();
  const { reorder, isReordering, outOfStockModal, confirmReorderRemaining, dismissOutOfStockModal } =
    useReorderItems();

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
    <div className="p-5 rounded-3xl bg-[#0D0D0D] border border-neutral-800 space-y-4 shadow-md hover:border-neutral-700 transition-colors">
      {/* Header: Order #, Store Name, Status Badge */}
      <div className="flex items-start justify-between gap-3 border-b border-neutral-850 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-black text-sm text-white">#{shortCode}</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                isCancelled
                  ? "bg-rose-950/80 text-rose-300 border-rose-500/40"
                  : isTerminal
                  ? "bg-emerald-950/80 text-emerald-300 border-emerald-500/40"
                  : "bg-orange-950/80 text-orange-400 border-orange-500/40 animate-pulse"
              }`}
            >
              {order.status.label || order.status.code}
            </span>
          </div>

          <p className="text-xs text-neutral-400 flex items-center gap-1 mt-1">
            <Store className="w-3.5 h-3.5 text-neutral-500" />
            <span>{order.store?.name || "Burgonomics Outlet"}</span>
            <span>•</span>
            <Clock className="w-3 h-3 text-neutral-500" />
            <span>{dateFormatted}</span>
          </p>
        </div>

        <div className="text-right">
          <span className="font-mono font-black text-base text-white">
            {formatINR(order.totals?.grandTotal || 0)}
          </span>
          <span className="text-[10px] text-neutral-400 block uppercase">
            {order.fulfillment} • {(order.payment?.method || "PAID").toUpperCase()}
          </span>
        </div>
      </div>

      {/* Item Summary Checklist */}
      <div className="space-y-1.5 text-xs text-neutral-300">
        {order.items?.map((item, idx) => (
          <div key={idx} className="flex justify-between">
            <span className="truncate max-w-[280px]">
              {item.quantity}x {item.name}
            </span>
            <span className="font-bold text-white font-mono">
              {formatINR((item.unitPrice || 0) * (item.quantity || 1))}
            </span>
          </div>
        ))}
      </div>

      {/* Post-Order 5-Star Rating Box (Completed Orders) */}
      {isTerminal && !isCancelled && !ratingSubmitted && (
        <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>How was your meal?</span>
            </span>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => handleRate(star)}
                  className="p-1 text-neutral-600 hover:text-amber-400 transition-colors cursor-pointer"
                >
                  <Star
                    className={`w-4 h-4 ${
                      rating && rating >= star ? "text-amber-400 fill-amber-400" : ""
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {rating && (
            <div className="space-y-2 pt-1 border-t border-neutral-900 animate-in fade-in duration-200">
              <div className="flex flex-wrap gap-1.5">
                {RATING_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleToggleTag(tag)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                      selectedTags.includes(tag)
                        ? "bg-[#0E4825] border-emerald-500 text-emerald-300"
                        : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleSaveRating}
                className="w-full py-1.5 rounded-xl bg-[#0E4825] hover:bg-[#135d30] text-emerald-300 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                Submit Review
              </button>
            </div>
          )}
        </div>
      )}

      {ratingSubmitted && (
        <div className="p-2.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>Rating saved on this device — detailed reviews launching soon.</span>
        </div>
      )}

      {/* Action Buttons: 1-Tap Reorder, Track, Invoice */}
      <div className="flex items-center gap-2 pt-1 border-t border-neutral-800/80">
        {!isTerminal ? (
          <button
            type="button"
            onClick={() => void navigate({ to: `/orders/${order.id}/track` as any })}
            className="flex-1 py-2.5 rounded-xl bg-[#0E4825] hover:bg-[#135d30] border border-emerald-500/40 text-emerald-300 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-[0.98] cursor-pointer"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Live Porter GPS</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={isReordering}
            onClick={() => void reorder(order)}
            className="flex-1 py-2.5 rounded-xl bg-[#FF6600] hover:bg-[#e05a00] text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isReordering ? "animate-spin" : ""}`} />
            <span>{isReordering ? "Adding..." : "1-Tap Reorder"}</span>
          </button>
        )}

        <InvoiceDownloadButton order={order} />
      </div>

      {/* Out of Stock Reorder Warning Modal */}
      {outOfStockModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0F0F0F] border border-neutral-800 rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-amber-400 font-black text-sm">
              <AlertCircle className="w-5 h-5" />
              <span>Some Items Unavailable</span>
            </div>

            <p className="text-xs text-neutral-400">
              The following item(s) are currently out of stock at this store:
            </p>

            <ul className="space-y-1 text-xs text-white list-disc list-inside bg-neutral-950 p-3 rounded-2xl border border-neutral-800">
              {outOfStockModal.unavailableItems.map((item, i) => (
                <li key={i} className="font-bold">
                  {item}
                </li>
              ))}
            </ul>

            <p className="text-xs text-neutral-400">
              Would you like to reorder the remaining available items?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
              <button
                type="button"
                onClick={dismissOutOfStockModal}
                className="px-3 py-2 rounded-xl bg-neutral-900 text-neutral-300 font-bold text-xs hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReorderRemaining}
                className="px-4 py-2 rounded-xl bg-[#FF6600] text-white font-black text-xs uppercase tracking-wider shadow-md hover:bg-[#e05a00]"
              >
                Reorder Remaining
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OrderHistoryCard;
