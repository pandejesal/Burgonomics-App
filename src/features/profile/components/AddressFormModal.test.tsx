/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AddressFormModal } from "./AddressFormModal";
import { addressRepository } from "@/features/addresses/repositories/AddressRepository";
import { toast } from "sonner";

vi.mock("@/features/addresses/repositories/AddressRepository", () => ({
  addressRepository: { update: vi.fn(async () => ({ success: true })), create: vi.fn() },
}));
vi.mock("@/features/stores/hooks/useLocationPermission", () => ({
  useLocationPermission: () => ({
    request: vi.fn(),
    coords: null,
    status: "unavailable",
    isLoading: false,
  }),
}));
vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn(), selection: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: React.forwardRef(() => null),
  useMap: () => ({ flyTo: vi.fn(), getZoom: () => 16 }),
  useMapEvents: vi.fn(),
}));

function makeRect(top: number, height: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    left: 0,
    right: 400,
    bottom: top + height,
    width: 400,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

/**
 * Layout-aware rect stubs: the field moves with the form's scroll position, and
 * the form's visible box is whatever slice of the sheet the keyboard leaves
 * behind (`boxHeight` is read per call so a test can shrink it mid-flight).
 * Repeated reveal passes therefore converge exactly like a real reflow instead
 * of double-scrolling a frozen measurement.
 */
function stubFormLayout(
  form: HTMLFormElement,
  field: HTMLInputElement,
  opts: { boxTop: number; boxHeight: () => number; fieldContentTop: number },
) {
  form.getBoundingClientRect = () => makeRect(opts.boxTop, opts.boxHeight());
  field.getBoundingClientRect = () => makeRect(opts.fieldContentTop - form.scrollTop, 44);
}

/** Type into a React-controlled input without firing focus (jsdom-safe). */
function typeInto(input: HTMLInputElement, value: string) {
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value");
  desc?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Every mounted root is tracked so a failing test can never leak a live portal
 * into the next test (the sheet portals to `document.body`, so a leaked sheet
 * would shadow the next test's dialog lookup and cascade failures).
 */
const mounted: Array<{ root: Root; host: HTMLDivElement }> = [];

/** The component portals to `document.body`; with failure-safe cleanup there is
 *  exactly one live dialog, and the newest one always belongs to this test. */
function lastDialog(): HTMLElement {
  const dialogs = document.querySelectorAll<HTMLElement>("[role=dialog]");
  return dialogs[dialogs.length - 1]!;
}

function pressEscape() {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
}

afterEach(async () => {
  for (const { root, host } of mounted.splice(0)) {
    await act(async () => root.unmount());
    host.remove();
  }
  document.body.innerHTML = "";
});

async function renderModal() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const close = vi.fn();
  await act(async () => root.render(<AddressFormModal isOpen onClose={close} />));
  mounted.push({ root, host });
  const dialog = lastDialog();
  const form = dialog.querySelector<HTMLFormElement>("form")!;
  const line1 = form.querySelector<HTMLInputElement>('input[placeholder^="e.g. Flat 402"]')!;
  return { host, root, dialog, form, line1, close };
}

it("portals outside transformed screens and submits from a non-scrolling save footer", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  host.style.transform = "translateX(0)";
  document.body.append(host);
  const root = createRoot(host);
  const close = vi.fn();
  await act(async () =>
    root.render(
      <AddressFormModal
        isOpen
        onClose={close}
        addressToEdit={{
          id: "test-address",
          label: "home",
          line1: "Test building",
          city: "Ahmedabad",
          pincode: "380001",
          lat: 23.02,
          lng: 72.57,
          isDefault: false,
        }}
      />,
    ),
  );
  mounted.push({ root, host });
  const dialog = lastDialog();
  expect(host.contains(dialog)).toBe(false);
  const save = dialog.querySelector<HTMLButtonElement>("button[type=submit]")!;
  expect(save.textContent).toBe("Update Address");
  expect(save.closest("form")).toBeNull();
  expect(save.form).toBe(dialog.querySelector("form"));
  expect(save.parentElement?.className).toContain("shrink-0");
  await act(async () => save.click());
  expect(addressRepository.update).toHaveBeenCalledOnce();
  expect(addressRepository.update).toHaveBeenCalledWith(
    "test-address",
    expect.objectContaining({ line1: "Test building", lat: 23.02 }),
  );
  expect(close).toHaveBeenCalledOnce();
}, 15000);

it("scrolls the focused field into the form's visible box when it starts below it", async () => {
  const { form, line1 } = await renderModal();
  // Visible box 100..300; the field sits at 520..564 until the form scrolls.
  stubFormLayout(form, line1, {
    boxTop: 100,
    boxHeight: () => 200,
    fieldContentTop: 520,
  });
  expect(form.scrollTop).toBe(0);

  act(() => line1.focus());
  expect(document.activeElement).toBe(line1);
  // 564 (field bottom) - 300 (box bottom) + 12px gutter = 276.
  expect(form.scrollTop).toBe(276);
  const fieldRect = line1.getBoundingClientRect();
  const boxRect = form.getBoundingClientRect();
  expect(fieldRect.bottom).toBeLessThanOrEqual(boxRect.bottom - 12);
  expect(fieldRect.top).toBeGreaterThanOrEqual(boxRect.top);
});

it("re-reveals the focused field when the viewport shrinks under the keyboard", async () => {
  const { form, line1 } = await renderModal();
  let boxHeight = 400;
  stubFormLayout(form, line1, {
    boxTop: 100,
    boxHeight: () => boxHeight,
    fieldContentTop: 300,
  });

  act(() => line1.focus());
  expect(form.scrollTop).toBe(0); // visible before the keyboard opens

  boxHeight = 180; // keyboard shrank the sheet: box is now 100..280
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
  // 344 (field bottom) - 280 (box bottom) + 12px gutter = 76.
  expect(form.scrollTop).toBe(76);
  const fieldRect = line1.getBoundingClientRect();
  expect(fieldRect.bottom).toBeLessThanOrEqual(280 - 12);
  expect(fieldRect.top).toBeGreaterThanOrEqual(100);
});

it("uses visualViewport resize/scroll signals when the browser exposes them and drops them on close", async () => {
  const handlers = new Map<string, () => void>();
  const viewport = {
    addEventListener: vi.fn((type: string, cb: () => void) => {
      handlers.set(type, cb);
    }),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(window, "visualViewport", {
    value: viewport,
    configurable: true,
    writable: true,
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(<AddressFormModal isOpen onClose={vi.fn()} />);
    });
    mounted.push({ root, host });
    const dialog = lastDialog();
    const form = dialog.querySelector<HTMLFormElement>("form")!;
    const line1 = form.querySelector<HTMLInputElement>('input[placeholder^="e.g. Flat 402"]')!;

    expect(viewport.addEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(viewport.addEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));

    let boxHeight = 400;
    stubFormLayout(form, line1, {
      boxTop: 100,
      boxHeight: () => boxHeight,
      fieldContentTop: 300,
    });
    act(() => line1.focus());
    expect(form.scrollTop).toBe(0);

    boxHeight = 180;
    act(() => {
      handlers.get("resize")?.();
    });
    expect(form.scrollTop).toBe(76);

    // Closing the sheet tears the viewport listeners down (effect cleanup).
    await act(async () => {
      root.render(<AddressFormModal isOpen={false} onClose={vi.fn()} />);
    });
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(viewport.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(viewport.removeEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(handlers.size).toBeGreaterThanOrEqual(2);

    // The captured handler must be inert after teardown: no crash, no scroll.
    const before = form.scrollTop;
    expect(() => handlers.get("resize")?.()).not.toThrow();
    expect(form.scrollTop).toBe(before);
  } finally {
    Reflect.deleteProperty(window, "visualViewport");
  }
});

it("stops steering the scroll once focus leaves the fields for the save footer", async () => {
  const { dialog, form, line1 } = await renderModal();
  let boxHeight = 400;
  stubFormLayout(form, line1, {
    boxTop: 100,
    boxHeight: () => boxHeight,
    fieldContentTop: 300,
  });
  act(() => line1.focus());
  expect(form.scrollTop).toBe(0);

  const save = dialog.querySelector<HTMLButtonElement>("button[type=submit]")!;
  act(() => save.focus());
  expect(document.activeElement).toBe(save);

  boxHeight = 100; // a resize while the footer has focus must not scroll us
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
  expect(form.scrollTop).toBe(0);
});

it("keeps the scroll-box and footer layout contract the reveal depends on", async () => {
  const { dialog, form } = await renderModal();
  const save = dialog.querySelector<HTMLButtonElement>("button[type=submit]")!;
  const footer = save.parentElement!;

  // Scrollable form stays min-h-0 so the sheet shrinks instead of overflowing.
  expect(form.className).toContain("min-h-0");
  expect(form.className).toContain("flex-1");
  expect(form.className).toContain("overflow-y-auto");
  // Header and save footer keep fixed heights outside the scroll box.
  const header = dialog.firstElementChild!;
  expect(header.className).toContain("shrink-0");
  expect(footer.className).toContain("shrink-0");
  expect(form.contains(footer)).toBe(false);
  expect(form.contains(header)).toBe(false);
  expect(dialog.className).toContain("overflow-hidden");
});

it("closes a clean form straight away through the close control", async () => {
  const { dialog, close } = await renderModal();
  await act(async () =>
    dialog.querySelector<HTMLButtonElement>('button[aria-label="Close modal"]')!.click(),
  );
  expect(close).toHaveBeenCalledTimes(1);
  expect(dialog.querySelector("[role=alertdialog]")).toBeNull();
});

it("asks before discarding typed input on Escape and keeps the edits when cancelled", async () => {
  const { dialog, line1, close } = await renderModal();
  await act(async () => typeInto(line1, "B-42, Sunshine Heights"));

  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
  // Escape no longer closes outright — the confirm step takes its place and
  // focus lands on the safe action.
  expect(close).not.toHaveBeenCalled();
  const panel = dialog.querySelector<HTMLElement>("[role=alertdialog]")!;
  expect(panel).not.toBeNull();
  const keepEditing = Array.from(panel.querySelectorAll("button")).find(
    (b) => b.textContent === "Keep editing",
  )!;
  expect(document.activeElement).toBe(keepEditing);

  // Cancelling returns to the form with the typed value intact.
  await act(async () => keepEditing.click());
  expect(dialog.querySelector("[role=alertdialog]")).toBeNull();
  expect(line1.value).toBe("B-42, Sunshine Heights");
  expect(close).not.toHaveBeenCalled();

  // Escape after Keep editing re-opens the confirm because the edits remain.
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
  expect(dialog.querySelector("[role=alertdialog]")).not.toBeNull();
  expect(close).not.toHaveBeenCalled();
});

it("dismisses the discard confirm on a second Escape without losing edits", async () => {
  const { dialog, line1, close } = await renderModal();
  await act(async () => typeInto(line1, "B-42, Sunshine Heights"));

  pressEscape();
  expect(dialog.querySelector("[role=alertdialog]")).not.toBeNull();

  pressEscape();
  expect(dialog.querySelector("[role=alertdialog]")).toBeNull();
  expect(close).not.toHaveBeenCalled();
  expect(line1.value).toBe("B-42, Sunshine Heights");
});

it("discards the edits and closes once the confirm is accepted", async () => {
  const { dialog, line1, close } = await renderModal();
  await act(async () => typeInto(line1, "Flat 9, Palm Grove"));

  // The close control takes the same guarded path as Escape.
  await act(async () =>
    dialog.querySelector<HTMLButtonElement>('button[aria-label="Close modal"]')!.click(),
  );
  expect(close).not.toHaveBeenCalled();
  const panel = dialog.querySelector<HTMLElement>("[role=alertdialog]")!;
  const discard = Array.from(panel.querySelectorAll("button")).find(
    (b) => b.textContent === "Discard",
  )!;
  await act(async () => discard.click());
  expect(close).toHaveBeenCalledTimes(1);
});

it("warns on reload only while there are unsaved changes", async () => {
  const { line1 } = await renderModal();

  const clean = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);

  await act(async () => typeInto(line1, "Flat 9, Palm Grove"));
  const dirty = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(dirty);
  expect(dirty.defaultPrevented).toBe(true);
});

/** Edit-mode sheet with every required field already seeded, so a test can
 *  submit without pinning the map (the persistence path is what matters here). */
async function renderEditModal() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const close = vi.fn();
  await act(async () =>
    root.render(
      <AddressFormModal
        isOpen
        onClose={close}
        addressToEdit={{
          id: "test-address",
          label: "home",
          line1: "Test building",
          city: "Ahmedabad",
          pincode: "380001",
          lat: 23.02,
          lng: 72.57,
          isDefault: false,
        }}
      />,
    ),
  );
  mounted.push({ root, host });
  const dialog = lastDialog();
  const form = dialog.querySelector<HTMLFormElement>("form")!;
  return { host, root, dialog, form, close };
}

it("keeps the sheet, the typed values and an inline alert when the remote save fails", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.mocked(addressRepository.update).mockResolvedValueOnce({
    success: false,
    error: {
      code: "WRITE_FAILED",
      message: "We couldn't update your address. Please try again.",
      retryable: true,
    },
  } as never);

  const { dialog, form, close } = await renderEditModal();
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  expect(addressRepository.update).toHaveBeenCalledOnce();
  // No false success: the sheet stays open on the same values.
  expect(close).not.toHaveBeenCalled();
  expect(dialog.isConnected).toBe(true);
  const line1 = dialog.querySelector<HTMLInputElement>('input[placeholder^="e.g. Flat 402"]')!;
  expect(line1.value).toBe("Test building");
  // The failure is announced inline (role=alert), not only as a toast that a
  // screen reader may miss and that vanishes before the customer can act.
  const alert = dialog.querySelector<HTMLElement>('[role="alert"]');
  expect(alert?.textContent).toContain("couldn't save your changes");
  expect(toast.success).not.toHaveBeenCalled();
}, 15000);

it("coalesces a rapid double submit into exactly one remote save", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let release!: (value: unknown) => void;
  vi.mocked(addressRepository.update).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve as (value: unknown) => void;
      }) as never,
  );

  const { form, close } = await renderEditModal();
  // Two native submits before React can re-render the disabled button: the
  // same double-activation a fast tap or Enter+click produces on a phone.
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(addressRepository.update).toHaveBeenCalledOnce();

  await act(async () => release({ success: true }));
  expect(close).toHaveBeenCalledOnce();
}, 15000);

it("releases the re-entry guard after a failed save so one later tap can retry", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.mocked(addressRepository.update)
    .mockResolvedValueOnce({
      success: false,
      error: { code: "WRITE_FAILED", message: "failed", retryable: true },
    } as never)
    .mockResolvedValueOnce({ success: true } as never);

  const { form, close } = await renderEditModal();
  const submit = () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

  await act(async () => submit());
  expect(addressRepository.update).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
  // The guard must not turn a failed attempt into a dead form: a deliberate
  // second tap is a legitimate retry.
  await act(async () => submit());
  expect(addressRepository.update).toHaveBeenCalledTimes(2);
  expect(close).toHaveBeenCalledOnce();
}, 15000);

it("blocks a retry after a session change because the first write already committed", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.mocked(addressRepository.update).mockResolvedValueOnce({
    success: false,
    error: {
      code: "AUTH_CHANGED",
      message:
        "Your session changed before we could confirm that. Reopen this address after signing in.",
      retryable: false,
    },
  } as never);

  const { dialog, form } = await renderEditModal();
  const submit = () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

  await act(async () => submit());
  const alert = dialog.querySelector<HTMLElement>('[role="alert"]');
  expect(alert?.textContent).toContain("session changed");
  const save = dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  expect(save.disabled).toBe(true);
  expect(save.textContent).toContain("Reopen to retry");
  // A programmatic/Enter submit must not sneak past the terminal block.
  await act(async () => submit());
  expect(addressRepository.update).toHaveBeenCalledOnce();
}, 15000);
