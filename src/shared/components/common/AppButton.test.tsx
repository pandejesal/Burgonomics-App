/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppButton } from "./AppButton";
import { AudioService } from "@/core/services/audio";
import { HapticService } from "@/core/services/haptics";

// React act() needs this flag outside of Jest.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// Hermetic: no Capacitor, no AudioContext, no real haptics hardware.
vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn() },
}));
vi.mock("@/core/services/audio", () => ({
  AudioService: { playClick: vi.fn() },
}));

const impact = vi.mocked(HapticService.impact);
const playClick = vi.mocked(AudioService.playClick);

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  impact.mockResolvedValue(undefined);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host = null;
  document.body.innerHTML = "";
});

/** Mount a real React tree into a fresh host appended to the live document. */
async function mount(ui: React.ReactElement) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(ui));
  return host;
}

/** A form built as plain DOM, outside any React tree (the "owner" side). */
function ownerForm(id: string) {
  const form = document.createElement("form");
  form.id = id;
  document.body.append(form);
  return form;
}

/** Count the submit events that actually fire on a form. */
function countSubmits(form: HTMLFormElement) {
  const state = { submits: 0 };
  form.addEventListener("submit", (e) => {
    e.preventDefault(); // jsdom would otherwise attempt a navigation
    state.submits += 1;
  });
  return state;
}

const findButton = () => host!.querySelector("button") as HTMLButtonElement;

describe("AppButton — native form submission (B02 submit repair)", () => {
  it("fires the owner form's submit exactly once for a submit button inside the form", async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const onClick = vi.fn();

    // The whole consumer shape: a plain form rendered by the app, the
    // design-system submit button rendered by React inside it.
    await mount(
      <form onSubmit={onSubmit}>
        <AppButton type="submit" onClick={onClick}>
          Place order
        </AppButton>
      </form>,
    );
    const button = findButton();
    const counter = countSubmits(button.closest("form") as HTMLFormElement);
    expect(button.type).toBe("submit");

    // .click() is the real DOM activation API — the same path a real pointer
    // click takes, including the platform's default action (form submission).
    await act(async () => button.click());

    // Pre-fix this was 2: the platform's activation behavior PLUS a manual
    // `form.dispatchEvent(new Event("submit"))`. The synthetic event is what
    // double-submits orders/promos in a real browser; this asserts exactly 1.
    expect(counter.submits).toBe(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("keeps submitting exactly once when the button is associated by the form attribute (external footer)", async () => {
    // Footer pattern: the form lives outside the button's DOM subtree (here,
    // outside the React tree entirely); the button points at it with
    // form="…" — native ownership, no DOM walking.
    const form = ownerForm("footer-form");
    const counter = countSubmits(form);
    const onClick = vi.fn();

    await mount(
      <div>
        <AppButton type="submit" form="footer-form" onClick={onClick}>
          Pay from footer
        </AppButton>
      </div>,
    );
    const button = findButton();

    expect(button.form).toBe(form);

    await act(async () => button.click());

    expect(counter.submits).toBe(1);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("submits zero times when the user's onClick calls preventDefault", async () => {
    const form = ownerForm("prevented-form");
    const counter = countSubmits(form);
    const onClick = vi.fn((e: React.MouseEvent<HTMLButtonElement>) => e.preventDefault());

    await mount(
      <div>
        <AppButton type="submit" form="prevented-form" onClick={onClick}>
          Intercept
        </AppButton>
      </div>,
    );

    await act(async () => findButton().click());

    // e.preventDefault() on the click cancels the platform default action —
    // the standard semantic, now with no synthetic event to leak around it.
    expect(counter.submits).toBe(0);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("blocks everything while loading: no click, no submit, no haptics, no audio", async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const onClick = vi.fn();
    const nativeClicks = vi.fn();

    await mount(
      <form onSubmit={onSubmit}>
        <AppButton type="submit" loading onClick={onClick}>
          Processing
        </AppButton>
      </form>,
    );
    const button = findButton();

    // UI state proof: the platform sees a disabled, busy button.
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.querySelector("svg.animate-spin")).not.toBeNull();

    button.addEventListener("click", nativeClicks);
    await act(async () => button.click());

    // A disabled button never activates: no React handler, no native submit,
    // no side effects.
    expect(nativeClicks).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(impact).not.toHaveBeenCalled();
    expect(playClick).not.toHaveBeenCalled();
  });

  it("blocks the same way for an explicitly disabled button", async () => {
    const form = ownerForm("disabled-form");
    const counter = countSubmits(form);
    const onClick = vi.fn();

    await mount(
      <div>
        <AppButton type="submit" form="disabled-form" disabled onClick={onClick}>
          Unavailable
        </AppButton>
      </div>,
    );
    const button = findButton();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-disabled")).toBe("true");

    await act(async () => button.click());

    expect(counter.submits).toBe(0);
    expect(onClick).not.toHaveBeenCalled();
    expect(impact).not.toHaveBeenCalled();
    expect(playClick).not.toHaveBeenCalled();
  });

  it("defaults to type=button and never submits the surrounding form", async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const onClick = vi.fn();

    await mount(
      <form onSubmit={onSubmit}>
        <AppButton onClick={onClick}>Add to cart</AppButton>
      </form>,
    );
    const button = findButton();
    const counter = countSubmits(button.closest("form") as HTMLFormElement);
    expect(button.getAttribute("type")).toBe("button");

    await act(async () => button.click());

    expect(counter.submits).toBe(0);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is a real <button>, so keyboard Enter/Space activation stays the platform's own", async () => {
    await mount(
      <form>
        <AppButton type="submit">Pay</AppButton>
      </form>,
    );
    const button = findButton();

    // The keyboard contract is structural, not scripted: a native BUTTON
    // gets Enter/Space activation from the platform (the real key-press
    // proof lives in the Playwright harness). A div[role=button] would not.
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("role")).toBeNull();
    expect(button.getAttribute("type")).toBe("submit");
  });

  it("fires haptics + audio once per enabled click, and a rejected haptic promise does not suppress the native submit", async () => {
    const form = ownerForm("haptic-form");
    const counter = countSubmits(form);
    const onClick = vi.fn();

    // The haptics service is fire-and-forget; simulate it rejecting the way
    // a real device/WebView failure would.
    impact.mockRejectedValueOnce(new Error("haptics unavailable"));

    await mount(
      <div>
        <AppButton type="submit" form="haptic-form" onClick={onClick}>
          Pay anyway
        </AppButton>
      </div>,
    );

    await act(async () => findButton().click());

    // Native submit and the user's handler are untouched by the failure; the
    // rejection is handled at the call site, so it cannot surface as an
    // unhandled rejection (the run itself would fail if it did).
    expect(counter.submits).toBe(1);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(impact).toHaveBeenCalledTimes(1);
    expect(playClick).toHaveBeenCalledTimes(1);
  });

  it("scales the haptic with the variant (medium primary, light otherwise)", async () => {
    await mount(
      <div>
        <AppButton variant="primary">Primary</AppButton>
        <AppButton variant="secondary">Secondary</AppButton>
      </div>,
    );
    const [primary, secondary] = Array.from(host!.querySelectorAll("button"));

    await act(async () => primary.click());
    expect(impact).toHaveBeenLastCalledWith("medium");

    await act(async () => secondary.click());
    expect(impact).toHaveBeenLastCalledWith("light");
    expect(impact).toHaveBeenCalledTimes(2);
    expect(playClick).toHaveBeenCalledTimes(2);
  });

  it("keeps the 44px India PlayStore a11y floor on the small size", async () => {
    await mount(<AppButton size="sm">Small</AppButton>);
    const button = findButton();
    expect(button.className).toMatch(/min-h-11/);
    expect(button.className).toMatch(/min-w-11/);
  });

  it("forwards the ref to the real button element", async () => {
    const ref = React.createRef<HTMLButtonElement>();
    await mount(<AppButton ref={ref}>Ref</AppButton>);
    expect(ref.current).toBe(findButton());
    expect(ref.current?.tagName).toBe("BUTTON");
  });
});

describe("AppButton source — no synthetic submit dispatch (ownership boundary)", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/shared/components/common/AppButton.tsx"),
    "utf8",
  );

  it("relies on native button/form association only", () => {
    // The double-submit defect was a manual `form.dispatchEvent(new
    // Event("submit"))` racing the platform's own default action.
    expect(source).not.toMatch(/dispatchEvent/);
    expect(source).not.toMatch(/new Event\(/);
    expect(source).not.toMatch(/closest\("form"\)/);
  });

  it("still renders type from props with the button default", () => {
    expect(source).toMatch(/type=\{rest\.type \|\| "button"\}/);
  });
});
