/**
 * A11Y-01 (WCAG 1.4.4 Resize Text): pinch-zoom must not be disabled.
 *
 * Both the static shell (index.html, used by the hosted build) and the
 * TanStack head meta (used after client navigation) declared
 * `maximum-scale=1, user-scalable=no`. Safe-area layout depends on
 * `viewport-fit=cover`, never on the zoom lock, so only the lock is removed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

const viewportMeta = (html: string) =>
  html.match(/<meta\s+name="viewport"[^>]*content="([^"]+)"/i)?.[1] ?? "";

describe("A11Y-01 — viewport does not block zoom", () => {
  it("index.html keeps responsive + safe-area viewport but allows pinch zoom", () => {
    const content = viewportMeta(read("index.html"));
    expect(content).toContain("width=device-width");
    expect(content).toContain("initial-scale=1");
    expect(content).toContain("viewport-fit=cover");
    expect(content).not.toContain("maximum-scale");
    expect(content).not.toContain("user-scalable=no");
  });

  it("the router head meta matches the static shell", () => {
    const root = read("src/routes/__root.tsx");
    const content = root.match(/content:\s*"([^"]*viewport-fit[^"]*)"/i)?.[1] ?? "";
    expect(content).toContain("width=device-width");
    expect(content).toContain("initial-scale=1");
    expect(content).toContain("viewport-fit=cover");
    expect(content).not.toContain("maximum-scale");
    expect(content).not.toContain("user-scalable");
  });
});
