/**
 * Checkout must never present a figure it cannot stand behind.
 *
 * Found live on the deployed bundle:
 *  1. the packaging row stayed on "Getting price…" indefinitely when quoting
 *     failed, instead of stating the failure; and
 *  2. the sticky bar said "To Pay ₹109" while the bill directly below said
 *     "Total so far … Excludes packaging" - two contradictory readings of the
 *     same money.
 *
 * These are source-contract assertions, deliberately: reaching those rows needs
 * a full checkout render (store, address, fulfilment, quote), and a render test
 * that fakes all of that would assert the fake more than the money rule. The
 * behavioural checkout flows are covered by checkout.fulfillment.test.tsx and
 * its siblings.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "./checkout.tsx"), "utf8");

/** The sticky bottom bar region. */
function stickyBar(): string {
  const start = SRC.indexOf("bottomSlot={");
  const end = SRC.indexOf("</AppShell>", start);
  if (start < 0 || end < 0) throw new Error("sticky bar region not found");
  return SRC.slice(start, end);
}

/** The in-bill totals region (label + amount + caveat). */
function billTotals(): string {
  const start = SRC.indexOf('{quoteView.packagingPending ? "Total so far" : "To Pay"}');
  const end = SRC.indexOf("5. Payment Method Selector", start);
  if (start < 0 || end < 0) throw new Error("bill totals region not found");
  return SRC.slice(start, end);
}

describe("checkout total honesty", () => {
  it("never leaves an eternal 'Getting price…' when the quote has failed", () => {
    // The packaging row must branch to a terminal state on a failed quote.
    const packaging = SRC.slice(
      SRC.indexOf("Restaurant Packaging"),
      SRC.indexOf("Delivery Fee — server courier quote only"),
    );
    expect(packaging).toContain("Getting price…");
    // …and that spinner must be guarded by the failure status.
    expect(packaging).toMatch(/unserviceable[\s\S]{0,120}error/);
    expect(packaging).toContain("Unavailable");
  });

  it("labels the sticky bar 'Total so far' while the bill is provisional", () => {
    const bar = stickyBar();
    expect(bar).toContain('quoteView.packagingPending ? "Total so far" : "To Pay"');
    expect(bar).toContain("Excludes packaging");
  });

  it("uses the same provisional wording in the bill and the sticky bar", () => {
    // One source of truth: both regions read packagingPending.
    expect(billTotals()).toContain("Total so far");
    expect(stickyBar()).toContain("packagingPending");
  });

  it("does not hardcode a final 'To Pay' in the sticky bar", () => {
    const bar = stickyBar();
    // A bare <p>To Pay</p> was the defect: it contradicted the bill.
    expect(bar).not.toMatch(/>\s*To Pay\s*</);
  });
});
