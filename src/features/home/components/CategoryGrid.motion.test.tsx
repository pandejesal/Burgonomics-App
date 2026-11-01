/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const effects = vi.hoisted(() => ({ navigate: vi.fn(), selection: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => effects.navigate }));
vi.mock("@/core/services/haptics", () => ({ HapticService: { selection: effects.selection } }));
import { CategoryGrid } from "./CategoryGrid";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const categories = [
  { id: "real-burgers", name: "Classic Burgers", itemCount: 4 },
  { id: "real-sides", name: "Sides", itemCount: 3 },
  { id: "real-shakes", name: "Shakes", itemCount: 2 },
];
interface Observation {
  node: Element;
  callback: IntersectionObserverCallback;
  disconnected: boolean;
}
let observations: Observation[];
let motionListeners: Set<() => void>;
let reduced: boolean;
let visibility: DocumentVisibilityState;
let root: Root | null;
let host: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  reduced = false;
  visibility = "visible";
  observations = [];
  motionListeners = new Set();
  root = null;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return reduced;
      },
      addEventListener: (_: string, listener: () => void) => motionListeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => motionListeners.delete(listener),
    })),
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      private readonly watched: Observation[] = [];
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(node: Element) {
        const observation = { node, callback: this.callback, disconnected: false };
        this.watched.push(observation);
        observations.push(observation);
      }
      disconnect() {
        this.watched.forEach((observation) => {
          observation.disconnected = true;
        });
      }
    },
  );
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function mount(loadPhotos = true) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<CategoryGrid categories={categories} />));
  if (loadPhotos) {
    await act(async () =>
      host.querySelectorAll("img").forEach((image) => image.dispatchEvent(new Event("load"))),
    );
  }
}

function button(label: string) {
  return host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
}
function frame(label: string) {
  return button(label).querySelector<HTMLDivElement>(".home-shortcut-photo")!;
}
function intersect(label: string, visible: boolean) {
  const observation = observations.find(
    (candidate) => candidate.node === frame(label) && !candidate.disconnected,
  );
  if (!observation) throw new Error(`No active observer for ${label}`);
  observation.callback(
    [
      {
        target: observation.node,
        isIntersecting: visible,
        intersectionRatio: visible ? 1 : 0,
      } as IntersectionObserverEntry,
    ],
    {} as IntersectionObserver,
  );
}

describe("Home shortcut image flips", () => {
  it("flips once after visibility, leaves the label stationary, and still navigates in one tap", async () => {
    await mount();
    act(() => intersect("Burgers", true));
    act(() => vi.advanceTimersByTime(799));
    expect(frame("Burgers").dataset.flipped).toBe("false");
    act(() => vi.advanceTimersByTime(1));
    expect(frame("Burgers").dataset.flipped).toBe("true");
    expect(button("Burgers").querySelector("h4")!.closest(".home-shortcut-photo")).toBeNull();
    await act(async () => button("Burgers").click());
    expect(effects.navigate).toHaveBeenCalledWith({
      to: "/menu",
      search: { category: "real-burgers" },
    });
    act(() => intersect("Burgers", false));
    act(() => intersect("Burgers", true));
    act(() => vi.advanceTimersByTime(60_000));
    expect(frame("Burgers").dataset.flipped).toBe("true");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels offscreen work and applies the per-card stagger only after re-entry", async () => {
    await mount();
    act(() => intersect("Sides", true));
    act(() => vi.advanceTimersByTime(600));
    act(() => intersect("Sides", false));
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(5_000));
    expect(frame("Sides").dataset.flipped).toBe("false");
    act(() => intersect("Sides", true));
    // Sides is now the second visible card: missing Wraps is hidden.
    act(() => vi.advanceTimersByTime(949));
    expect(frame("Sides").dataset.flipped).toBe("false");
    act(() => vi.advanceTimersByTime(1));
    expect(frame("Sides").dataset.flipped).toBe("true");
  });

  it("has no background-page timer and restarts the visible delay when the page returns", async () => {
    await mount();
    act(() => intersect("Burgers", true));
    act(() => vi.advanceTimersByTime(400));
    act(() => {
      visibility = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(5_000));
    expect(frame("Burgers").dataset.flipped).toBe("false");
    act(() => {
      visibility = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(800);
    });
    expect(frame("Burgers").dataset.flipped).toBe("true");
  });

  it("honours reduced motion at start and when the preference changes", async () => {
    reduced = true;
    await mount();
    act(() => intersect("Burgers", true));
    act(() => vi.advanceTimersByTime(10_000));
    expect(frame("Burgers").dataset.flipped).toBe("false");
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      reduced = false;
      motionListeners.forEach((listener) => listener());
      vi.advanceTimersByTime(800);
    });
    expect(frame("Burgers").dataset.flipped).toBe("true");
    act(() => {
      reduced = true;
      motionListeners.forEach((listener) => listener());
    });
    expect(frame("Burgers").dataset.flipped).toBe("false");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits for both photos, stays static after a failure, and never invents Wraps art", async () => {
    await mount(false);
    expect(observations).toHaveLength(0);
    const photos = button("Burgers").querySelectorAll("img");
    await act(async () => photos[0].dispatchEvent(new Event("load")));
    expect(observations).toHaveLength(0);
    await act(async () => photos[1].dispatchEvent(new Event("load")));
    act(() => intersect("Burgers", true));
    await act(async () => photos[1].dispatchEvent(new Event("error")));
    act(() => vi.advanceTimersByTime(5_000));
    expect(frame("Burgers").dataset.flipped).toBe("false");
    expect(button("Burgers").querySelectorAll("img")).toHaveLength(1);
    expect(host!.querySelector('button[aria-label="Wraps"]')).toBeNull();
  });

  it("disconnects observers and clears the delayed flip on unmount", async () => {
    await mount();
    act(() => intersect("Burgers", true));
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => root!.unmount());
    root = null;
    expect(vi.getTimerCount()).toBe(0);
    expect(observations.every((observation) => observation.disconnected)).toBe(true);
    expect(motionListeners.size).toBe(0);
  });
});
