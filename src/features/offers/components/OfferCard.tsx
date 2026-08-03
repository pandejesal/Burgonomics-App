import * as React from "react";
import { Tag, Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppCard } from "@/shared/components/common/AppCard";
import { AppBadge } from "@/shared/components/common/AppBadge";
import { Text } from "@/shared/components/common/Text";
import { AppButton } from "@/shared/components/common/AppButton";
import type { Offer } from "@/features/offers/models";

interface Props {
  offer: Offer;
  applied?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onApply?: (offer: Offer) => void;
  onRemove?: (offer: Offer) => void;
  onViewTerms?: (offer: Offer) => void;
}

function expiryLabel(iso?: string): string | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return null;
  const days = Math.max(0, Math.ceil((ts - Date.now()) / 86_400_000));
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  if (days <= 7) return `Expires in ${days} days`;
  return `Valid till ${new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

/**
 * OfferCard — repository-driven, self-contained tile. Every field
 * shown here originates from the offers backend; the frontend does not
 * infer, format, or compute discounts.
 */
export function OfferCard({
  offer,
  applied = false,
  disabled = false,
  busy = false,
  onApply,
  onRemove,
  onViewTerms,
}: Props) {
  const expiry = expiryLabel(offer.expiresAt);
  const isAutomatic = offer.automatic;
  const minOrder = offer.eligibility.minOrderValue;
  const isEligibleStatus = offer.status === "active";

  return (
    <AppCard
      elevation="flat"
      padded
      className={cn(
        "border border-dashed border-primary/50 bg-primary/5",
        applied && "border-solid border-success bg-success/10",
        !isEligibleStatus && "opacity-70",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-full",
            applied ? "bg-success/15 text-success" : "bg-primary/15 text-primary",
          )}
          aria-hidden
        >
          {applied ? <CheckCircle2 className="h-5 w-5" /> : <Tag className="h-5 w-5" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Text variant="titleMedium" className="truncate">
              {offer.title}
            </Text>
            <AppBadge tone={applied ? "success" : "primary"}>{offer.discount.label}</AppBadge>
            {isAutomatic && !applied && <AppBadge tone="neutral">Auto-applied</AppBadge>}
          </div>

          <Text variant="bodyMedium" tone="secondary" className="mt-0.5 line-clamp-2">
            {offer.description}
          </Text>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 type-caption text-text-secondary">
            {offer.code && (
              <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-primary/60 px-1.5 py-0.5 font-mono uppercase tracking-wider text-primary">
                {offer.code}
              </span>
            )}
            {typeof minOrder === "number" && minOrder > 0 && <span>Min order ₹{minOrder}</span>}
            {typeof offer.discount.maxDiscount === "number" && (
              <span>Up to ₹{offer.discount.maxDiscount} off</span>
            )}
            {expiry && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                {expiry}
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onViewTerms?.(offer)}
              className="type-label-large text-primary underline underline-offset-2"
            >
              View terms
            </button>
            {applied ? (
              <AppButton
                variant="secondary"
                size="sm"
                onClick={() => onRemove?.(offer)}
                loading={busy}
              >
                Remove
              </AppButton>
            ) : isAutomatic ? (
              <AppBadge tone="success">Applied automatically</AppBadge>
            ) : (
              <AppButton
                variant="primary"
                size="sm"
                disabled={disabled || !isEligibleStatus}
                loading={busy}
                onClick={() => onApply?.(offer)}
              >
                Apply
              </AppButton>
            )}
          </div>
        </div>
      </div>
    </AppCard>
  );
}
