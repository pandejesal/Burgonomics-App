/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { HomeAnnouncements } from "./HomeAnnouncements";
import type { ApprovedHomeContent } from "../approvedHomeContent";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | null = null;
let host: HTMLDivElement;

async function mount(content?: ApprovedHomeContent) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<HomeAnnouncements content={content} />));
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host?.remove();
});

describe("approved bottom-of-Home announcements", () => {
  it("renders nothing when an owner supplies no approved content", async () => {
    await mount({ awards: [], upcomingStores: [] });
    expect(host.innerHTML).toBe("");
  });

  it("places Awards & Recognition before Upcoming Branches using only supplied content", async () => {
    await mount({
      awards: [{ id: "test-award", title: "Owner-supplied recognition", description: "Approved test description" }],
      upcomingStores: [{ id: "test-announcement", name: "Owner-supplied store", location: "Approved test location" }],
    });
    expect(Array.from(host.querySelectorAll("h2"), (heading) => heading.textContent)).toEqual([
      "Awards & Recognition", "Upcoming Branches",
    ]);
    expect(host.textContent).toContain("Approved test description");
    expect(host.textContent).toContain("Approved test location");
    expect(host.querySelector("button, a, input, form")).toBeNull();
    expect(host.textContent).not.toMatch(/opening soon|notify me|order now/i);
  });

  it("hides each empty section independently and adds dates only when supplied", async () => {
    await mount({
      awards: [],
      upcomingStores: [{ id: "test-announcement", name: "Test store", location: "Test location", openingText: "Owner-confirmed test timing" }],
    });
    expect(host.querySelectorAll("section")).toHaveLength(1);
    expect(host.textContent).not.toContain("Awards & Recognition");
    expect(host.textContent).toContain("Owner-confirmed test timing");
  });

  it("uses one readable ceremony photograph without dropping award entries", async () => {
    await mount({
      awards: [
        { id: "first", title: "First award", imageUrl: "/first.webp" },
        { id: "second", title: "Second award", imageUrl: "/second.webp" },
      ],
      upcomingStores: [],
    });
    const photos = host.querySelectorAll("#awards img");
    expect(photos).toHaveLength(1);
    expect(photos[0].className).toContain("aspect-[3/1]");
    expect((photos[0] as HTMLImageElement).style.objectPosition).toBe("50% 20%");
    expect(host.querySelector("#awards li")?.className).toContain("py-2.5");
    expect(host.textContent).toContain("First award");
    expect(host.textContent).toContain("Second award");
  });
});
