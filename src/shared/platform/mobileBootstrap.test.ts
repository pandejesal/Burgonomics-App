import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { APP_ROUTE_HOSTS, resolveAppUrl } from "./mobileBootstrap";

/**
 * Regression for native deep links: a custom-scheme URL puts the first route
 * segment in `url.host` (`burgonomics://orders/<id>`), so reading only
 * `url.pathname` routed to `/<id>` and dropped host-only links such as
 * `burgonomics://menu`. Universal links keep pathname routing.
 *
 * The host is NOT a free-form namespace: `burgonomics://evil.com/x` used to be
 * accepted verbatim and pushed into the router as the in-app path `/evil.com/x`.
 * Only a real top-level segment of this app may be addressed, and that list is
 * derived from `src/routes` and re-derived here from the directory itself, so a
 * new route file cannot silently fall out of the accepted set (or sneak in).
 */
const ROUTES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../routes");

/** Top-level segments declared by the route files, excluding the root layout. */
function derivedRouteHosts(): string[] {
  const segments = readdirSync(ROUTES_DIR)
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map((name) => name.replace(/\.tsx?$/, "").split(".")[0])
    .filter((segment) => segment !== "__root" && segment !== "index");
  return [...new Set(segments)].sort();
}

describe("resolveAppUrl", () => {
  it.each([
    ["burgonomics://orders/123", "/orders/123"],
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

describe("resolveAppUrl custom-scheme hosts", () => {
  it("accepts only a real top-level route segment as the host", () => {
    // A host that is a domain, not a route, is never an in-app path.
    expect(resolveAppUrl("burgonomics://evil.com/x")).toBeNull();
    // A lookalike of a real route is not that route.
    expect(resolveAppUrl("burgonomics://ordersevil.com/x")).toBeNull();
    expect(resolveAppUrl("burgonomics://checkout.razorpay.com/pay")).toBeNull();
  });

  it("keeps the empty-host form working (burgonomics:///path)", () => {
    expect(resolveAppUrl("burgonomics:///orders/ord_1")).toBe("/orders/ord_1");
    expect(resolveAppUrl("burgonomics:///menu?tab=all")).toBe("/menu?tab=all");
  });

  it("derives its accepted hosts from src/routes, not from a guess", () => {
    expect([...APP_ROUTE_HOSTS].sort()).toEqual(derivedRouteHosts());
  });

  it.each(derivedRouteHosts())("routes burgonomics://%s/... into the app", (host) => {
    expect(resolveAppUrl(`burgonomics://${host}/probe?q=1`)).toBe(`/${host}/probe?q=1`);
  });
});
