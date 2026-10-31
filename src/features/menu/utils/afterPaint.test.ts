/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { afterNextPaint } from "./afterPaint";

/** Review repair (F): jumps must wait for a real paint, with a safe fallback. */

const originalRaf = window.requestAnimationFrame;

afterEach(() => {
  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    value: originalRaf,
  });
});

describe("afterNextPaint", () => {
  it("waits for two animation frames so React has committed and painted", async () => {
    const frames: FrameRequestCallback[] = [];
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      },
    });

    let resolved = false;
    const done = afterNextPaint().then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(frames).toHaveLength(1);

    frames[0](0);
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(frames).toHaveLength(2);

    frames[1](16);
    await done;
    expect(resolved).toBe(true);
  });

  it("falls back to a macrotask when requestAnimationFrame is unavailable", async () => {
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: undefined,
    });

    let resolved = false;
    const done = afterNextPaint().then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    await done;
    expect(resolved).toBe(true);
  });
});
