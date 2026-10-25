import { describe, expect, it } from "vitest";
import { resolveAppUrl } from "./mobileBootstrap";

/**
 * Regression for native deep links: a custom-scheme URL puts the first route
 * segment in `url.host` (`burgonomics://orders/<id>`), so reading only
 * `url.pathname` routed to `/<id>` and dropped host-only links such as
 * `burgonomics://menu`. Universal links keep pathname routing.
 */
describe("resolveAppUrl", () => {
  it.each([
    ["burgonomics://orders/ord_1/track", "/orders/ord_1/track"],
    ["burgonomics://menu", "/menu"],
    ["burgonomics://orders/ord_1?x=1#frag", "/orders/ord_1?x=1#frag"],
    ["burgonomics:///orders/ord_1", "/orders/ord_1"],
    ["https://burgonomics.com/orders/ord_1", "/orders/ord_1"],
    ["https://www.burgonomics.com/menu?tab=all", "/menu?tab=all"],
    ["https://burgonomics.netlify.app/offers", "/offers"],
  ])("maps %s to %s", (input, expected) => {
    expect(resolveAppUrl(input)).toBe(expected);
  });

  it.each([
    "https://evil.example/orders",
    "https://burgonomics.com.evil.example/orders",
    "https://checkout.razorpay.com/pay",
    "https://partner.burgonomics.com/kds",
    "javascript:alert(1)",
    "not a url",
    "burgonomics://",
    "burgonomics:////evil.com/phish",
  ])("rejects %s", (input) => {
    expect(resolveAppUrl(input)).toBeNull();
  });
});
