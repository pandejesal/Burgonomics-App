/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRootHeightVar } from "./useRootHeightVar";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

class Observer {
  static all: Observer[] = [];
  disconnected = false;
  constructor(private readonly callback: ResizeObserverCallback) { Observer.all.push(this); }
  observe() {}
  disconnect() { this.disconnected = true; }
  // A queued delivery can arrive after disconnect; cleanup must fence it.
  deliver() { this.callback([], this as unknown as ResizeObserver); }
}

function Owner({ name = "--probe-height", enabled = true }: {
  name?: `--${string}`;
  enabled?: boolean;
}) {
  return <div ref={useRootHeightVar(name, enabled)} />;
}

let root: Root;
let container: HTMLDivElement;
let height: number;
let scale: number;
const value = (name = "--probe-height") => document.documentElement.style.getPropertyValue(name);
const render = async (element: React.ReactElement) => {
  await act(async () => root.render(element));
};

beforeEach(() => {
  height = 100;
  scale = 1;
  Observer.all = [];
  vi.stubGlobal("ResizeObserver", Observer);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(() => height);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
    x: 0, y: 0, top: 0, bottom: height * scale, left: 0, right: 100,
    width: 100, height: height * scale, toJSON: () => ({}),
  }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const name of ["--probe-height", "--next-height"]) document.documentElement.style.removeProperty(name);
});

describe("measured root-height lifecycle", () => {
  it("keeps a live observer after StrictMode's extra attach/detach cycle", async () => {
    await render(<React.StrictMode><Owner /></React.StrictMode>);
    expect(value()).toBe("100px");
    expect(Observer.all.filter(o => !o.disconnected)).toHaveLength(1);
    height = 132;
    await act(async () => Observer.all.filter(o => !o.disconnected).forEach(o => o.deliver()));
    expect(value()).toBe("132px");
  });

  it("ignores a queued observer delivery after its node detaches", async () => {
    await render(<Owner />);
    const old = Observer.all[0];
    expect(value()).toBe("100px");
    await render(<span />);
    expect(value()).toBe("");
    await act(async () => old.deliver());
    expect(value()).toBe("");
  });

  it("does not restore an old property after the owner changes its name", async () => {
    await render(<Owner />);
    const old = Observer.all[0];
    await render(<Owner name="--next-height" />);
    height = 120;
    await act(async () => old.deliver());
    expect(value()).toBe("");
    expect(value("--next-height")).toBe("100px");
  });

  it("removes stale clearance when an attached bar has no layout box", async () => {
    await render(<Owner />);
    height = 0;
    await act(async () => Observer.all[0].deliver());
    expect(value()).toBe("");
  });

  it("never publishes a non-finite height", async () => {
    height = Number.NaN;
    await render(<Owner />);
    expect(value()).toBe("");
  });

  it("measures the untransformed border box during the cart bar's scale animation", async () => {
    scale = 0.95;
    await render(<Owner />);
    expect(value()).toBe("100px");
  });

  it("releases clearance when the owner becomes inline/disabled", async () => {
    await render(<Owner />);
    const old = Observer.all[0];
    await render(<Owner enabled={false} />);
    await act(async () => old.deliver());
    expect(value()).toBe("");
  });

  it("updates and cleans up through the resize fallback without ResizeObserver", async () => {
    vi.stubGlobal("ResizeObserver", undefined);
    await render(<Owner />);
    expect(value()).toBe("100px");
    height = 132;
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(value()).toBe("132px");
    await render(<span />);
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(value()).toBe("");
  });
});
