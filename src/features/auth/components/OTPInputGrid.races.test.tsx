/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OTPInputGrid } from "./OTPInputGrid";

/**
 * OTP grid slot-integrity regressions.
 *
 * The grid used to rebuild its value with `.replace(/\s/g, "")`, so clearing a
 * middle box collapsed every later digit one slot left, and a paste always
 * filled from box 0 regardless of focus. Both silently produced a wrong code.
 * `onComplete` must also stay silent while disabled (verify in flight) so a
 * late callback cannot re-submit or double-submit.
 */

function setInput(el: HTMLInputElement, next: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setValue.call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("OTPInputGrid slot integrity", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  function boxes(): HTMLInputElement[] {
    return Array.from(container.querySelectorAll<HTMLInputElement>("input"));
  }

  it("keeps later digits in place when a middle box is cleared", async () => {
    const onChange = vi.fn();
    await act(async () =>
      root.render(<OTPInputGrid value="129456" onChange={onChange} length={6} />),
    );

    await act(async () => setInput(boxes()[2], ""));

    expect(boxes()[3].value).toBe("4");
    expect(boxes()[5].value).toBe("6");

    await act(async () => setInput(boxes()[2], "9"));

    expect(
      boxes()
        .map((b) => b.value)
        .join(""),
    ).toBe("129456");
    expect(onChange).toHaveBeenLastCalledWith("129456");
  });

  it("starts a paste at the focused box, not at box 0", async () => {
    const onChange = vi.fn();
    await act(async () => root.render(<OTPInputGrid value="12" onChange={onChange} length={6} />));

    // jsdom cannot populate clipboardData reliably, so drive the shared
    // multi-digit branch of the same handler (a paste is handled identically).
    await act(async () => setInput(boxes()[2], "456"));

    expect(onChange).toHaveBeenLastCalledWith("12456");
    expect(boxes()[0].value).toBe("1");
    // Pasted at box index 2, so the digits occupy boxes 2..4 — not box 0.
    expect(boxes()[2].value).toBe("4");
    expect(boxes()[4].value).toBe("6");
    expect(boxes()[5].value).toBe("");
  });

  it("restores a middle hole in place when remounted from a controlled value", async () => {
    const onChange = vi.fn();
    const onComplete = vi.fn();
    await act(async () =>
      root.render(
        <OTPInputGrid value="12 456" onChange={onChange} onComplete={onComplete} length={6} />,
      ),
    );

    expect(boxes().map((b) => b.value)).toEqual(["1", "2", "", "4", "5", "6"]);
    // Five real digits: never a completion, never a collapsed "12456" remount.
    expect(onComplete).not.toHaveBeenCalled();
  });
  it("does not complete while disabled", async () => {
    const onComplete = vi.fn();
    await act(async () =>
      root.render(
        <OTPInputGrid
          value="123456"
          onChange={vi.fn()}
          onComplete={onComplete}
          disabled
          length={6}
        />,
      ),
    );
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("completes once for a full code and not again on an identical rerender", async () => {
    const onComplete = vi.fn();
    const onChange = vi.fn();
    await act(async () =>
      root.render(
        <OTPInputGrid value="123456" onChange={onChange} onComplete={onComplete} length={6} />,
      ),
    );
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("123456");

    await act(async () =>
      root.render(
        <OTPInputGrid value="123456" onChange={onChange} onComplete={onComplete} length={6} />,
      ),
    );
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("re-completes after a cleared slot is retyped", async () => {
    const onComplete = vi.fn();
    const onChange = vi.fn();
    await act(async () =>
      root.render(
        <OTPInputGrid value="129456" onChange={onChange} onComplete={onComplete} length={6} />,
      ),
    );
    expect(onComplete).toHaveBeenCalledTimes(1);

    await act(async () => setInput(boxes()[2], ""));
    expect(onComplete).toHaveBeenCalledTimes(1);

    await act(async () => setInput(boxes()[2], "9"));
    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenLastCalledWith("129456");
  });
});
