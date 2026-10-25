import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/shared/layouts/AppShell";
import { AppCard } from "@/shared/components/common/AppCard";
import { Text } from "@/shared/components/common/Text";
import { FileText, ShoppingCart, Clock, RotateCcw, HelpCircle } from "lucide-react";
import { APP, isUnsetRegistrationValue } from "@/core/constants/app";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — Burgonomics" },
      {
        name: "description",
        content: "Terms of Service, Order Conditions, and Refund Policy for Burgonomics.",
      },
    ],
  }),
  component: TermsPage,
});

// P1-7: statutory IDs render only once real values replace the X-masked
// placeholders — never print filler on customer-facing legal surfaces.
const CIN = isUnsetRegistrationValue(APP.cin) ? null : APP.cin;
const GSTIN = isUnsetRegistrationValue(APP.gstin) ? null : APP.gstin;
const FSSAI = isUnsetRegistrationValue(APP.fssaiLicense) ? null : APP.fssaiLicense;
const HAS_REG_IDS = !!(CIN || GSTIN || FSSAI);

function TermsPage() {
  return (
    <AppShell title="Terms & Conditions" backTo="/profile" showTabs={true} showTopBar={true}>
      <div className="mx-auto max-w-[680px] space-y-6 px-4 py-6">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <FileText className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <Text variant="headlineMedium" as="h1" className="font-bold">
              Terms & Conditions
            </Text>
            <Text variant="caption" tone="secondary">
              Last updated: August 29, 2026 · {APP.legalEntity} (trading as {APP.tradeName}), India
            </Text>
          </div>
        </div>

        <AppCard padded className="space-y-4">
          <section className="space-y-2">
            <Text variant="titleMedium" className="font-bold flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary" /> 1. Ordering & Acceptance
            </Text>
            <Text variant="bodySmall" tone="secondary" className="leading-relaxed">
              By placing an order via the Burgonomics app, you make an offer to purchase food items
              at the stated prices. Order acceptance occurs when the restaurant store acknowledges
              the order and generates a Kitchen Order Ticket (KOT).
            </Text>
          </section>

          <section className="space-y-2 pt-3 border-t border-divider">
            <Text variant="titleMedium" className="font-bold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> 2. Pricing, Taxes & Delivery (India)
            </Text>
            <Text variant="bodySmall" tone="secondary" className="leading-relaxed">
              All prices are in <strong>Indian Rupees (INR)</strong> and include statutory <strong>GST 5% (CGST 2.5% + SGST 2.5%)</strong>. Checkout shows full breakup: <strong>Subtotal + GST 5% + Packing Fee + Delivery Fee = Payable</strong>. Delivery is <strong>FREE above ₹499</strong>, otherwise a flat delivery fee (as shown at checkout) applies. No international shipping — India only.
            </Text>
          </section>

          <section className="space-y-2 pt-3 border-t border-divider">
            <Text variant="titleMedium" className="font-bold flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> 2b. Seller Disclosure (Consumer Protection E-Commerce Rules, 2020)
            </Text>
            <Text variant="bodySmall" tone="secondary" className="leading-relaxed">
              <strong>Seller:</strong> {APP.legalEntity} (trading as {APP.tradeName}), {APP.registeredAddress}, India.<br />
              {/* P1-7: registration IDs render only once real values replace the
                  X-masked placeholders — never print filler. */}
              {HAS_REG_IDS && (
                <>
                  {CIN && <><strong>CIN:</strong> {CIN} · </>}
                  {GSTIN && <><strong>GSTIN:</strong> {GSTIN} · </>}
                  {FSSAI && <><strong>FSSAI Lic. No.:</strong> {FSSAI} (per store, displayed on menu &amp; checkout).</>}
                  <br />
                </>
              )}
              <strong>Helpline:</strong> {APP.supportEmail} · via the in-app Help &amp; Support channel.<br />
              <strong>100% Pure Veg:</strong> All items are strictly vegetarian; FSSAI-licensed kitchens with zero cross-contamination.
            </Text>
          </section>

          <section className="space-y-2 pt-3 border-t border-divider">
            <Text variant="titleMedium" className="font-bold flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-primary" /> 3. Cancellations & Refunds
            </Text>
            <Text variant="bodySmall" tone="secondary" className="leading-relaxed">
              Orders may be cancelled free of charge prior to kitchen confirmation. Once food
              preparation has begun, cancellations cannot be accepted due to perishable goods
              regulations. If an order fails to deliver or arrives damaged/incorrect, a full or
              partial refund will be processed to the original payment method within 5–7 business
              days via Razorpay.
            </Text>
          </section>

          <section className="space-y-2 pt-3 border-t border-divider">
            <Text variant="titleMedium" className="font-bold flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-primary" /> 4. Customer Support
            </Text>
            <Text variant="bodySmall" tone="secondary" className="leading-relaxed">
              If you have any questions regarding your order or these terms, please contact our
              support team at <strong>{APP.supportEmail}</strong> or via the in-app Help &amp;
              Support channel.
            </Text>
          </section>
        </AppCard>
      </div>
    </AppShell>
  );
}
