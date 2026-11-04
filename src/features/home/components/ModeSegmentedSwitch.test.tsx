/**
 * Fulfilment segment labels must never break mid-word at 200% text.
 *
 * Measured live on the deployed bundle at 390x844 with html font-size 200%:
 * every segment button measured 98px wide while its label span was 66px and
 * rendered on TWO lines — that is "Deliv/ery", i.e. SC 1.4.4 Resize Text
 * ("text can be resized … up to 200 percent without loss of content or
 * functionality", https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)
 * failing in the sense that the label stops being readable.
 *
 * The cause is structural: three `flex-1` columns with `break-words` force each
 * label into a third of the row however narrow that gets.
 */
/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "./ModeSegmentedSwitch.tsx"), "utf8");

describe("ModeSegmentedSwitch survives 200% text", () => {
  it("wraps columns instead of squeezing three into one row", () => {
    expect(SRC).toContain("flex-wrap");
  });

  it("never breaks a label mid-word", () => {
    // The label span must be an unbreakable unit. (The word appears in the
    // comment explaining the fix, so assert on the class attribute instead.)
    expect(SRC).toContain('className="max-w-full whitespace-nowrap"');
    expect(SRC).not.toMatch(/className="[^"]*break-words[^"]*"/);
  });

  it("lets a wide label push its own button to the next line", () => {
    // min-w-fit + basis-0: equal thirds normally, whole-button wrap when a
    // label cannot fit its share.
    expect(SRC).toContain("min-w-fit");
    expect(SRC).toContain("basis-0");
  });

  it("keeps the 48px minimum target height", () => {
    expect(SRC).toContain("min-h-12");
  });
});
