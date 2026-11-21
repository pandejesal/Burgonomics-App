import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Loyalty retirement in the CUSTOMER app (owner decision 2026-11-20: "Loyalty
 * no: hide coins, tiers and points everywhere").
 *
 * The checkout sign-in path and the order-confirmation screen still READ the
 * loyalty store: QuickAuthSheet refreshed the balance after OTP verification,
 * authStore refreshed it on every restore/verify, and the confirmation screen
 * refreshed it on load. Nothing renders or spends that balance any more (the
 * wallet and redemption UI were removed earlier), so each call is a background
 * read of a retired feature.
 *
 * The assertions target the MECHANISM (the store import and its refresh call),
 * not the word "loyalty" in prose: the explanatory comments left behind in the
 * fixed files are deliberate documentation of the retirement, and a test that
 * banned the word would force those comments to be deleted.
 *
 * RED against the pre-fix source, which has three consumers.
 */
function walkSource(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkSource(full));
      continue;
    }
    // Tests may legitimately exercise the store; production code may not use it.
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry)) continue;
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    // The store module itself is the thing being retired, not a consumer.
    if (full.replace(/\\/g, "/").endsWith("features/loyalty/state/loyaltyStore.ts")) continue;
    out.push(full);
  }
  return out;
}

const consumers = () =>
  walkSource("src")
    .filter((file) => /useLoyaltyStore|refreshFromServer/.test(readFileSync(file, "utf8")))
    .map((file) => file.replace(/\\/g, "/"));

describe("customer app: loyalty store has no consumer after the retirement", () => {
  it("no production source file reads the loyalty balance", () => {
    expect(consumers()).toEqual([]);
  });

  it("the checkout sign-in sheet does not refresh a coin balance", () => {
    const sheet = readFileSync("src/features/checkout/components/QuickAuthSheet.tsx", "utf8");
    expect(sheet).not.toMatch(/useLoyaltyStore|refreshFromServer/);
  });

  it("auth restore/verify paths do not refresh a coin balance", () => {
    const store = readFileSync("src/features/auth/state/authStore.ts", "utf8");
    expect(store).not.toMatch(/useLoyaltyStore|refreshFromServer/);
  });

  it("order confirmation does not refresh a coin balance", () => {
    const confirmation = readFileSync("src/routes/order-confirmation.$orderId.tsx", "utf8");
    expect(confirmation).not.toMatch(/useLoyaltyStore|refreshFromServer/);
  });
});
