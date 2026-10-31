/**
 * Delivery-surface readability sweep — class-token verification.
 *
 * The screens below were rebuilt on the Inter / white-black / semantic-token
 * foundation: 14px floor for interface text, 44px controls, sentence-case
 * labels, green primary CTAs and no raw palette hexes. These tests pin the
 * token contract so a later edit cannot quietly reintroduce 9-11px text,
 * `font-black` ALL-CAPS or `#FF6600` buttons on these surfaces.
 *
 * Behaviour (validation, money, status copy) is covered by the existing
 * per-screen suites; nothing here asserts product logic.
 *
 * @vitest-environment jsdom
 */
import * as React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProductCard } from "@/shared/components/common/ProductCard";
import { OfferCard as SharedOfferCard } from "@/shared/components/common/OfferCard";
import { TextField } from "@/shared/components/common/TextField";
import { AddressCard } from "@/features/addresses/components/AddressCard";
import { EstimatedDeliveryCountdown } from "@/features/orders/components/EstimatedDeliveryCountdown";
import { DeliveryStepTracker } from "@/features/tracking/components/DeliveryStepTracker";
import type { Address } from "@/features/addresses/models";
import type { PorterTrackingState } from "@/features/tracking/hooks/usePorterLiveTracking";

const root = process.cwd();

function source(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

/** Every user-facing surface this sweep rewrote hands over to a reviewer. */
const SWEPT_SURFACES = [
  "src/routes/orders.index.tsx",
  "src/routes/orders.$orderId.track.tsx",
  "src/routes/order-confirmation.$orderId.tsx",
  "src/routes/profile.index.tsx",
  "src/routes/profile.addresses.tsx",
  "src/routes/profile.favorites.tsx",
  "src/routes/support.tsx",
  "src/routes/search.tsx",
  "src/shared/components/common/AppButton.tsx",
  "src/shared/components/common/ProductCard.tsx",
  "src/shared/components/common/OfferCard.tsx",
  "src/shared/components/common/TextField.tsx",
  "src/features/orders/components/EstimatedDeliveryCountdown.tsx",
  "src/features/orders/components/OrderSuccessCelebration.tsx",
  "src/features/orders/components/OrderTimeline.tsx",
  "src/features/profile/components/ProfileHeader.tsx",
  "src/features/profile/components/ProfileMenuList.tsx",
  "src/features/profile/components/GrillCoinsWalletCard.tsx",
  "src/features/support/components/CreateTicketForm.tsx",
  "src/features/support/components/TicketListAccordion.tsx",
  "src/features/offers/components/CouponCard.tsx",
  "src/features/offers/components/OfferCard.tsx",
  "src/features/offers/components/BOGOBanner.tsx",
  "src/features/tracking/components/DeliveryStepTracker.tsx",
  "src/features/tracking/components/LiveOrderMap.tsx",
  "src/features/tracking/components/RiderContactCard.tsx",
  "src/features/addresses/components/AddressCard.tsx",
  "src/features/addresses/components/AddressForm.tsx",
  "src/features/payments/components/PaymentMethodList.tsx",
  "src/features/orders/components/FulfillmentPanel.tsx",
  "src/features/orders/components/InvoiceDownloadButton.tsx",
  "src/features/offers/components/OfferTermsSheet.tsx",
  "src/features/profile/components/CompletionRing.tsx",
  "src/features/profile/components/EditProfileForm.tsx",
  "src/features/profile/components/AddressFormModal.tsx",
  "src/features/tracking/components/OrderCancellationGrace.tsx",
];

/**
 * Dense multi-column trackers and map overlay chips are the only places a
 * 12px label survives: four stages share one phone-width row and 14px wraps
 * into unreadable stacks. Every other surface must be at 14px or larger.
 */
const DENSE_LABEL_EXCEPTIONS = [
  "src/features/orders/components/EstimatedDeliveryCountdown.tsx",
  "src/features/orders/components/OrderTimeline.tsx",
  "src/features/tracking/components/DeliveryStepTracker.tsx",
  "src/features/tracking/components/LiveOrderMap.tsx",
];

/**
 * Decorative graphics keep their brand palette because they are painted into a
 * 2D canvas / Leaflet marker DOM string, outside the themed surface tree:
 * confetti particles and the destination map pin. Everything else must use
 * semantic tokens.
 */
const GRAPHICS_PALETTE_EXCEPTIONS = [
  "src/features/orders/components/OrderSuccessCelebration.tsx",
  "src/features/tracking/components/LiveOrderMap.tsx",
];

describe("no sub-14px interface text on swept surfaces", () => {
  it.each(SWEPT_SURFACES)("%s has no 9/10/11px or text-xs type", (file) => {
    const text = source(file);
    expect(text).not.toMatch(/text-\[9px\]|text-\[10px\]|text-\[11px\]/);
    if (!DENSE_LABEL_EXCEPTIONS.includes(file)) {
      expect(text).not.toMatch(/\btext-xs\b/);
    }
  });

  it("keeps the dense-label exceptions honest (12px only, never smaller)", () => {
    for (const file of DENSE_LABEL_EXCEPTIONS) {
      const text = source(file);
      expect(text).not.toMatch(/text-\[9px\]|text-\[10px\]|text-\[11px\]/);
    }
  });

  it.each(SWEPT_SURFACES)("%s uses no raw orange buttons or font-black", (file) => {
    const text = source(file);
    if (!GRAPHICS_PALETTE_EXCEPTIONS.includes(file)) {
      expect(text).not.toMatch(/#FF6600/i);
    }
    expect(text).not.toMatch(/\bfont-black\b/);
  });
});

describe("sentence-case, token-driven primitives", () => {
  it("ProductCard add button is green primary, 44px tall and says Add", () => {
    const html = renderToStaticMarkup(
      <ProductCard id="p1" name="Paneer Smash Burger" price={199} inStock />,
    );
    expect(html).toContain(">Add<");
    expect(html).not.toContain("ADD +");
    expect(html).toMatch(/bg-primary[^"]*text-primary-foreground/);
    expect(html).toContain("min-h-11");
    expect(html).toContain("text-sm");
    // A long product name must wrap, not be cut off.
    expect(html).not.toMatch(/truncate/);
  });

  it("shared OfferCard applies with a green primary button", () => {
    const html = renderToStaticMarkup(
      <SharedOfferCard
        code="BOGO50"
        title="Buy one get one"
        description="Two burgers for the price of one"
      />,
    );
    expect(html).toContain(">Apply<");
    expect(html).toMatch(/bg-primary[^"]*text-primary-foreground/);
    expect(html).toContain("min-h-11");
    expect(html).not.toContain("APPLY");
  });

  it("TextField labels are sentence-case at label size, not uppercase", () => {
    const html = renderToStaticMarkup(<TextField label="Mobile number" />);
    expect(html).toContain("Mobile number");
    expect(html).toContain("type-label-large");
    expect(html).not.toMatch(/uppercase/);
  });

  it("AddressCard lets a long address wrap instead of clamping it", () => {
    const address = {
      id: "a1",
      label: "home",
      line1: "Flat 402, Sunrise Residency, Behind the old water tank",
      line2: "Vesu Main Road",
      landmark: "Opposite the Jain temple",
      city: "Surat",
      pincode: "395007",
      lat: 21.14,
      lng: 72.77,
      isDefault: true,
      contactName: "Asha",
      contactPhone: "9876543210",
    } as unknown as Address;
    const html = renderToStaticMarkup(<AddressCard address={address} />);
    expect(html).toContain("Behind the old water tank");
    expect(html).not.toMatch(/truncate|line-clamp/);
  });
});

describe("tracking surfaces keep their honest copy and readable labels", () => {
  const tracking = {
    currentStage: 3,
    stageName: "Out for delivery",
    stageDescription: "Your courier is on the way",
    etaMinutes: null,
    isTakeawayOrDineIn: false,
    isCancelled: false,
    isDelivered: false,
    riderName: null,
    riderPhone: null,
    riderVehicleNumber: null,
    partnerName: "Porter",
    trackingUrl: null,
  } as unknown as PorterTrackingState;

  it("countdown reports an unknown ETA honestly with 14px copy", () => {
    const html = renderToStaticMarkup(
      <EstimatedDeliveryCountdown
        fulfillment="delivery"
        status={
          { code: "OUT_FOR_DELIVERY", label: "Out", kind: "in_progress", terminal: false } as never
        }
        estimatedMinutes={undefined}
      />,
    );
    expect(html).toContain("Estimate unavailable");
    expect(html).not.toContain("Mins Remaining");
    expect(html).toContain("type-title-large");
  });

  it("the stepper still names the courier honestly after dispatch", () => {
    const html = renderToStaticMarkup(<DeliveryStepTracker tracking={tracking} />);
    expect(html).toContain("Out for delivery — courier details appear after dispatch");
    expect(html).toContain("Grilling");
    expect(html).not.toMatch(/text-\[9px\]|text-\[10px\]|text-\[11px\]/);
  });
});
