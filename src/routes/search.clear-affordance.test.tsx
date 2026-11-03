/**
 * Live UI finding: the menu search field rendered TWO clear icons — the browser's
 * native `input[type=search]` cancel button and the app's own clear button — and
 * the app control measured 32x32, below the 44px touch aim.
 *
 * The native affordance cannot be removed from JSX (there is no attribute for
 * it), so the fix is a stylesheet rule. A jsdom test cannot compute stylesheet
 * cascade, so this asserts the rule and the component contract.
 */
/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
const SEARCH_ROUTE = readFileSync(resolve(__dirname, "./search.tsx"), "utf8");

describe("search field clear affordance", () => {
  it("suppresses the native search cancel button", () => {
    expect(CSS).toContain('input[type="search"]::-webkit-search-cancel-button');
    expect(CSS).toContain('input[type="search"]::-webkit-search-decoration');
  });

  it("actually hides it rather than only removing the appearance", () => {
    const rule = CSS.slice(CSS.indexOf('input[type="search"]::-webkit-search-cancel-button'));
    const block = rule.slice(0, rule.indexOf("}"));
    expect(block).toContain("display: none");
  });

  it("keeps exactly ONE app-owned clear control", () => {
    const matches = SEARCH_ROUTE.match(/aria-label="Clear search query"/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("sizes the app clear control to the 44px touch minimum", () => {
    const block = SEARCH_ROUTE.slice(SEARCH_ROUTE.indexOf('aria-label="Clear search query"'));
    const classNameAttr = block.slice(block.indexOf("className="));
    const value = classNameAttr.slice(0, classNameAttr.indexOf('"', 12));
    // h-11/w-11 = 44px.
    expect(value).toContain("h-11");
    expect(value).toContain("w-11");
  });

  it("restores focus to the input after clearing", () => {
    const block = SEARCH_ROUTE.slice(SEARCH_ROUTE.indexOf('aria-label="Clear search query"'));
    expect(block.slice(0, 600)).toContain("inputRef.current?.focus()");
  });
});
