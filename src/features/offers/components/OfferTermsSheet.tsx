import * as React from "react";
import { Calendar, Info, MapPin, Tag, Truck } from "lucide-react";
import { BottomSheet } from "@/shared/components/common/BottomSheet";
import { Text } from "@/shared/components/common/Text";
import { AppBadge } from "@/shared/components/common/AppBadge";
import type { Offer } from "@/features/offers/models";

interface Props {
  offer: Offer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatExpiry(iso?: string): string | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return null;
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function fulfillmentLabel(f: string) {
  if (f === "delivery") return "Delivery";
  if (f === "takeaway") return "Takeaway";
  if (f === "dinein") return "Dine-in";
  return f;
}

/**
 * OfferTermsSheet — read-only terms & eligibility panel. Every field
 * comes from the repository payload; the frontend adds no copy of its
 * own beyond section titles.
 */
export function OfferTermsSheet({ offer, open, onOpenChange }: Props) {
  if (!offer) return null;
  const { title, description, code, discount, eligibility, expiresAt, termsAndConditions } = offer;
  const expiry = formatExpiry(expiresAt);
  const fulfillments = eligibility.applicableFulfillments ?? [];
  const stores = eligibility.applicableStoreIds ?? [];

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <AppBadge tone="primary">{discount.label}</AppBadge>
          {code && (
            <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-primary/60 px-2 py-0.5 font-mono uppercase tracking-wider text-primary type-caption">
              <Tag className="h-3.5 w-3.5" aria-hidden />
              {code}
            </span>
          )}
          {offer.automatic && <AppBadge tone="success">Auto-applied</AppBadge>}
        </div>

        <dl className="space-y-2 rounded-[var(--radius-medium)] border border-divider bg-bg-secondary p-3">
          {typeof eligibility.minOrderValue === "number" && (
            <Row icon={<Info className="h-4 w-4" aria-hidden />} label="Minimum order">
              ₹{eligibility.minOrderValue}
            </Row>
          )}
          {typeof discount.maxDiscount === "number" && (
            <Row icon={<Info className="h-4 w-4" aria-hidden />} label="Maximum discount">
              ₹{discount.maxDiscount}
            </Row>
          )}
          {fulfillments.length > 0 && (
            <Row icon={<Truck className="h-4 w-4" aria-hidden />} label="Order methods">
              {fulfillments.map(fulfillmentLabel).join(", ")}
            </Row>
          )}
          {stores.length > 0 && (
            <Row icon={<MapPin className="h-4 w-4" aria-hidden />} label="Stores">
              {stores.length === 1 ? "1 store" : `${stores.length} stores`}
            </Row>
          )}
          {expiry && (
            <Row icon={<Calendar className="h-4 w-4" aria-hidden />} label="Valid till">
              {expiry}
            </Row>
          )}
        </dl>

        {termsAndConditions && termsAndConditions.length > 0 && (
          <section>
            <Text variant="titleMedium" className="mb-2">
              Terms &amp; Conditions
            </Text>
            <ul className="space-y-1.5 pl-4 type-body-medium text-text-secondary">
              {termsAndConditions.map((line, i) => (
                <li key={i} className="list-disc">
                  {line}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </BottomSheet>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-text-secondary">{icon}</span>
      <div className="min-w-0 flex-1">
        <dt className="type-caption text-text-secondary">{label}</dt>
        <dd className="type-body-medium">{children}</dd>
      </div>
    </div>
  );
}
