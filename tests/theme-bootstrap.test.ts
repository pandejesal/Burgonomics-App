/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

const html = readFileSync("index.html", "utf8");
const source = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!source) throw new Error("Missing pre-paint appearance bootstrap");

function boot(raw: string | null, dark: boolean, blocked = false) {
  document.head.innerHTML = '<meta name="theme-color" content="#FFFFFF">';
  const win = {
    localStorage: { getItem: () => { if (blocked) throw new Error("Storage blocked"); return raw; } },
    matchMedia: () => ({ matches: dark }),
  };
  new Function("window", "document", source!)(win, document);
}

afterEach(() => {
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("style");
});

describe("Delivery first-paint appearance", () => {
  it.each([
    [null, true, "dark"],
    [null, false, "light"],
    ['{"state":{"theme":"light"},"version":2}', true, "light"],
    ['{"state":{"theme":"dark"},"version":2}', false, "dark"],
    ['{"state":{"theme":"invalid"}}', true, "dark"],
    ["invalid-json", true, "dark"],
  ])("resolves %s with OS dark=%s to %s before React", (raw, osDark, expected) => {
    boot(raw, osDark);
    expect(document.documentElement.dataset.theme).toBe(expected);
    expect(document.documentElement.classList.contains("dark")).toBe(expected === "dark");
    expect(document.documentElement.style.colorScheme).toBe(expected);
    const canvas = expected === "dark" ? "#000000" : "#FFFFFF";
    expect(document.documentElement.style.getPropertyValue("--boot-canvas")).toBe(canvas);
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(canvas);
  });

  it("follows the OS when storage access throws", () => {
    boot(null, true, true);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("has no remote font requests and lets runtime tokens replace the pre-CSS canvas", () => {
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
    expect(html).toContain("background: var(--background, var(--boot-canvas");
  });
});
