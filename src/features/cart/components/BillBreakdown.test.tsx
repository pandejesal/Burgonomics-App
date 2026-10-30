/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { BillBreakdown } from "./BillBreakdown";
import { formatINR } from "@/core/utils/format";

/** The rendered "To Pay" amount — the last row's mono value. */
function toPayAmount(html: string): string {
  const match = html.match(/To Pay<\/span><span[^>]*>([\s\S]*?)<\/span>/);
  return match ? match[1].trim() : "";
}

describe("MT-09: Tax-Inclusive Pricing Display Suite", () => {
  it("presents the same bill as a flat section, not another nested card", () => {
    const html = renderToStaticMarkup(<BillBreakdown subtotal={418} gstAmount={20.9} />);
    const container = document.createElement("div");
    container.innerHTML = html;
    expect(container.firstElementChild?.classList.contains("border-t")).toBe(true);
    expect(container.firstElementChild?.classList.contains("border")).toBe(false);
    expect(container.firstElementChild?.className).not.toContain("shadow");
    expect(toPayAmount(html)).toBe(formatINR(418));
  });

  describe("1. 5% GST is inclusive — never added on top of the subtotal", () => {
    it("leaves To Pay at the GST-inclusive item total when no fees apply", () => {
      // Menu prices already carry 5% GST (2.5% CGST + 2.5% SGST inside ₹349).
      const html = renderToStaticMarkup(
        <BillBreakdown subtotal={349} gstAmount={17} fulfillment="delivery" />,
      );

      // 349 - 0 - 0 + 0 + 0 + 0 = 349 — the ₹17 of GST is NOT charged twice.
      expect(toPayAmount(html)).toBe(formatINR(349));
    });

    it("labels the bill as tax-inclusive and the GST line as included", () => {
      const html = renderToStaticMarkup(
        <BillBreakdown subtotal={349} gstAmount={17} fulfillment="delivery" />,
      );

      expect(html).toContain("Inclusive of all taxes (5% GST)");
      expect(html).toContain("Govt. GST (5% included)");
      // The informational GST figure is still shown for transparency.
      expect(html).toContain(formatINR(17));
    });
  });

  describe("2. Added-on charges still reach the payable", () => {
    it("adds packaging, delivery and tip — but never the tax again", () => {
      const subtotal = 400;
      const discount = 50;
      const coins = 100;
      const gst = 20;
      const packaging = 20;
      const delivery = 0; // free delivery above the ₹349 threshold
      const tip = 20;

      const html = renderToStaticMarkup(
        <BillBreakdown
          subtotal={subtotal}
          discountAmount={discount}
          coinsRedeemed={coins}
          gstAmount={gst}
          packagingFee={packaging}
          deliveryFee={delivery}
          tipAmount={tip}
          fulfillment="delivery"
        />,
      );

      // 400 - 50 - 100 + 20 + 0 + 20 = 290 (the old double-count was 310).
      expect(toPayAmount(html)).toBe(formatINR(290));
      // Total savings banner mirrors discount + redeemed points.
      expect(html).toContain(formatINR(150));
    });

    it("waives packaging and delivery for dine-in while keeping the GST-inclusive total", () => {
      const html = renderToStaticMarkup(
        <BillBreakdown
          subtotal={299}
          gstAmount={15}
          packagingFee={20}
          deliveryFee={40}
          fulfillment="dinein"
        />,
      );

      expect(toPayAmount(html)).toBe(formatINR(299));
      expect(html).not.toContain("Restaurant Packaging");
      expect(html).not.toContain("Delivery Fee");
    });

    it("keeps packaging for takeaway but drops the delivery fee", () => {
      const html = renderToStaticMarkup(
        <BillBreakdown
          subtotal={299}
          gstAmount={15}
          packagingFee={20}
          deliveryFee={40}
          fulfillment="takeaway"
        />,
      );

      expect(toPayAmount(html)).toBe(formatINR(319));
      expect(html).not.toContain("Delivery Fee");
    });
  });

  describe("3. Non-negative clamp", () => {
    it("clamps To Pay to zero when discounts exceed the bill", () => {
      const html = renderToStaticMarkup(
        <BillBreakdown
          subtotal={100}
          discountAmount={80}
          coinsRedeemed={60}
          gstAmount={5}
          fulfillment="delivery"
        />,
      );

      // 100 - 80 - 60 = -40 → never bill a negative amount.
      expect(toPayAmount(html)).toBe(formatINR(0));
    });
  });
});
