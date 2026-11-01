import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OrderSuccessCelebration } from "./OrderSuccessCelebration";
import { EstimatedDeliveryCountdown } from "./EstimatedDeliveryCountdown";
import type { Order } from "../models";

describe("honest kitchen acknowledgement", () => {
  it.each([
    undefined,
    "Pending",
    "Processing",
    "Failed",
    "Bypassed",
  ] satisfies Order["petpoojaStatus"][])(
    "does not claim kitchen receipt for %s",
    (petpoojaStatus) => {
      const html = renderToStaticMarkup(
        <OrderSuccessCelebration orderNumber="BG-1" petpoojaStatus={petpoojaStatus} />,
      );
      expect(html).not.toContain("transmitted your ticket directly to the kitchen POS");
      expect(html).not.toContain("sent your ticket to the kitchen");
      expect(html).toContain("Kitchen confirmation is pending.");
    },
  );
  it("acknowledges kitchen receipt only after sync", () => {
    const html = renderToStaticMarkup(
      <OrderSuccessCelebration orderNumber="BG-1" petpoojaStatus="Synced" />,
    );
    expect(html).toContain("sent your ticket to the kitchen.");
    expect(html).not.toContain("Kitchen confirmation is pending.");
  });
  it("shows no invented countdown when the order has no estimate", () => {
    const html = renderToStaticMarkup(
      <EstimatedDeliveryCountdown
        fulfillment="delivery"
        status={{ code: "PLACED", kind: "upcoming", label: "Placed", terminal: false }}
      />,
    );
    expect(html).toContain("Estimate unavailable");
    expect(html).not.toContain("Mins Remaining");
  });
});
