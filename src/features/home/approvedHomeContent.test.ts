import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { approvedHomeContent } from "./approvedHomeContent";

const root = process.cwd();

describe("owner-approved Home announcements", () => {
  it("carries the three awards transcribed from the franchise deck", () => {
    expect(approvedHomeContent.awards.map((award) => award.title)).toEqual([
      "Iconic Burger",
      "Best Quick Service Restaurant Chain",
      "Best Burger Joint",
    ]);
    for (const award of approvedHomeContent.awards) {
      expect(award.issuer).toBeTruthy();
      expect(["2025", "2026"]).toContain(award.year);
      expect(award.imageAlt).toBeTruthy();
      expect(award.certificateAlt).toBeTruthy();
    }
  });

  it("ships every referenced award image in public/, with local paths only", () => {
    for (const award of approvedHomeContent.awards) {
      for (const url of [award.imageUrl, award.certificateUrl]) {
        expect(url).toBeTruthy();
        expect(url!.startsWith("/images/brand/")).toBe(true);
        expect(existsSync(join(root, "public", url!.replace(/^\//, "")))).toBe(true);
      }
    }
  });

  it("lists only the eight stores the owner site marks as upcoming", () => {
    expect(approvedHomeContent.upcomingStores).toHaveLength(8);
    expect(approvedHomeContent.upcomingStores.map((store) => store.id)).toEqual([
      "gor-dhod-road",
      "vallabh-vidhyanagar",
      "hinjawadi-phase-2",
      "patan",
      "chandra-park",
      "ghatlodiya",
      "mehsana",
      "tin-batti",
    ]);
    // Already-open/new outlets from the same source are not upcoming.
    for (const open of ["Urban Chowk", "Narayanpura", "VR Mall", "CBD Mall", "New Ranip"]) {
      expect(approvedHomeContent.upcomingStores.map((s) => s.name)).not.toContain(open);
    }
  });

  it("never promises an opening or a discount the owner did not provide", () => {
    const text = JSON.stringify(approvedHomeContent).toLowerCase();
    for (const banned of ["opening soon", "grand opening", "notify me", "pre-order", "discount"]) {
      expect(text).not.toContain(banned);
    }
    for (const store of approvedHomeContent.upcomingStores) {
      expect(store.openingText).toBeTruthy();
      expect(store.openingText).toMatch(/^Planned for|^Opening date to be announced$/);
    }
  });
});
