/**
 * Checkout layout stability (Core Web Vitals CLS).
 *
 * Measured live: CLS 0.18 on /checkout. Per web.dev, "Good CLS values are 0.1 or
 * less. Poor values are greater than 0.25" — so 0.18 is "needs improvement"
 * (https://web.dev/articles/cls). Shifts caused by data arriving are NOT exempt:
 * only shifts "within 500 milliseconds of user input" carry hadRecentInput.
 *
 * Two blocks arrived late and pushed everything below them:
 *  1. the address skeleton was one 80px row while the loaded list is taller;
 *  2. the "Excludes packaging…" caveat was INSERTED when the quote resolved,
 *     and the fee rows had no fixed height so the value swap could reflow.
 *
 * jsdom cannot compute layout, so these assert the mechanism that reserves the
 * space. Real CLS is verified against the deployed bundle instead
 * (20-fix-verify/CSS-CLS-MEASURED.md).
 */
/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "./checkout.tsx"), "utf8");

/** The address block's loading branch. */
function addressLoading(): string {
  const start = SRC.indexOf('addressLoadState === "loading"');
  const end = SRC.indexOf('addressLoadState === "error"', start);
  if (start < 0 || end < 0) throw new Error("address loading branch not found");
  return SRC.slice(start, end);
}

/** The bill's fee-row region, starting a little before the first fee label. */
function feeRegion(): string {
  const labelAt = SRC.indexOf("Restaurant Packaging");
  const end = SRC.indexOf("Payment Method Selector", labelAt);
  if (labelAt < 0 || end < 0) throw new Error("fee region not found");
  return SRC.slice(Math.max(0, labelAt - 400), end);
}

describe("checkout reserves space so arriving data cannot shift the page", () => {
  it("skeleton rows occupy a height comparable to the loaded address list", () => {
    const block = addressLoading();
    // Two 80px rows now, inside a container with a floor height, instead of one.
    const skeletons = (block.match(/<Skeleton/g) ?? []).length;
    expect(skeletons).toBe(2);
    expect(block).toContain("h-20");
    expect(block).toContain("min-h-[11.5rem]");
  });

  it("keeps the loading state honest rather than rendering an empty list", () => {
    const block = addressLoading();
    expect(block).toContain('role="status"');
    expect(block).toContain("ADDRESS_LOADING_COPY");
  });

  it("gives the packaging fee row a fixed minimum height", () => {
    const region = feeRegion();
    // The class sits on the wrapper div immediately above the label.
    const labelAt = region.indexOf("Restaurant Packaging");
    const packagingRow = region.slice(Math.max(0, labelAt - 400), labelAt);
    expect(packagingRow).toContain("min-h-[1.75rem]");
  });

  it("gives the delivery fee row a fixed minimum height", () => {
    const region = feeRegion();
    const deliveryRow = region.slice(region.indexOf("Delivery Fee"));
    expect(deliveryRow).toContain("min-h-[1.75rem]");
  });

  it("always renders the packaging caveat line, reserving its space", () => {
    const region = feeRegion();
    // The caveat must be unconditional (space reserved) rather than inserted.
    expect(region).toContain("min-h-[1.25rem]");
    expect(region).toContain("quoteView.packagingPending");
    // A non-breaking space keeps the reserved line's height identical.
    expect(region).toContain("\\u00A0");
  });

  it("does not conditionally mount the caveat paragraph", () => {
    const region = feeRegion();
    // The old defect shape was `{quoteView.packagingPending && ( <p ...> )}`.
    expect(region).not.toMatch(/\{quoteView\.packagingPending && \(\s*<p/);
  });
});
