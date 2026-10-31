/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fail, ok } from "@/core/network/http";
import type { ApiResult } from "@/core/network/http";
import { useCartStore } from "@/features/cart/state/cartStore";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import { MAX_ORDER_NOTES_UNITS } from "@/features/checkout/utils/orderNotes";

const fixture = vi.hoisted(() => ({
  updateNotes: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastPlain: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(fixture.toastPlain, {
    success: fixture.toastSuccess,
    error: fixture.toastError,
    info: fixture.toastInfo,
  }),
}));

// Keep the real cart store; only the repository call is controlled. The
// feature index re-exports this module, so mocking it also covers the
// component's `import { cartRepository } from "@/features/cart"`.
vi.mock("@/features/cart/repositories/CartRepository", () => ({
  cartRepository: { updateNotes: fixture.updateNotes },
  CartRepository: class {},
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

import { CookingInstructionsSection } from "./CookingInstructionsSection";

function setTextareaValue(element: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

async function render() {
  const container = document.createElement("div");
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(<CookingInstructionsSection />);
  });
  return {
    container,
    text: () => container.textContent ?? "",
    textarea: () => container.querySelector("textarea"),
    toggle: () =>
      Array.from(container.querySelectorAll("button")).find((button) =>
        (button.textContent ?? "").includes("Add cooking instructions"),
      ),
    button: (label: string) =>
      Array.from(container.querySelectorAll("button")).find((button) =>
        (button.textContent ?? "").includes(label),
      ),
    cleanup: () => act(() => root.unmount()),
  };
}

function seedLegacyLine(note = "no onions") {
  useCartStore.setState({
    lines: [
      {
        lineId: "legacy-line",
        productId: "prod-1",
        storeId: "store-A",
        name: "Older Burger",
        unitPrice: 199,
        quantity: 1,
        modifiers: [],
        notes: note,
        availability: "available",
      },
    ],
    storeId: "store-A",
    status: "ready",
  });
}

const lineNote = () => useCartStore.getState().lines[0]?.notes;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  fixture.updateNotes.mockReset();
  fixture.updateNotes.mockImplementation(
    async (lineId: string, notes: string): Promise<ApiResult<void>> => {
      useCartStore.getState().updateNotes(lineId, notes);
      return ok(undefined);
    },
  );
  useCheckoutStore.getState().reset();
  useCheckoutStore.setState({ notesScope: null });
  useCartStore.setState({
    lines: [],
    storeId: null,
    promo: null,
    priceLockExpiresAt: null,
    status: "empty",
    error: null,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("CookingInstructionsSection — the cart's only note editor", () => {
  it("is collapsed behind a labelled control when empty, and expanded when a note exists", async () => {
    const empty = await render();
    expect(empty.textarea()).toBeNull();
    expect(empty.text()).toContain("Add cooking instructions");
    empty.cleanup();

    useCheckoutStore.getState().setOrderNotes("less spicy");
    const withNote = await render();
    expect(withNote.text()).toContain("Add cooking instructions");
    expect(withNote.textarea()?.value).toBe("less spicy");
    withNote.cleanup();
  });

  it("keeps the note when collapsed and re-expanded (navigation back)", async () => {
    const view = await render();
    await act(async () => {
      view.toggle()!.click();
    });

    await act(async () => {
      setTextareaValue(view.textarea()!, "extra napkins");
    });
    expect(useCheckoutStore.getState().orderNotes).toBe("extra napkins");

    await act(async () => {
      view.toggle()!.click();
    });
    expect(view.textarea()).toBeNull();

    await act(async () => {
      view.toggle()!.click();
    });
    expect(view.textarea()?.value).toBe("extra napkins");
    view.cleanup();
  });

  it("accepts an emoji note that reaches exactly 240 UTF-16 units", async () => {
    const view = await render();
    await act(async () => {
      view.toggle()!.click();
    });

    const atLimit = "🍔".repeat(120);
    await act(async () => {
      setTextareaValue(view.textarea()!, atLimit);
    });

    expect(useCheckoutStore.getState().orderNotes).toBe(atLimit);
    expect(view.text()).toContain(`240/${MAX_ORDER_NOTES_UNITS}`);
    view.cleanup();
  });

  it("rejects an overflowing paste entirely, keeps the prior value and shows feedback", async () => {
    useCheckoutStore.getState().setOrderNotes("short note");
    const view = await render();
    // The persisted note opens the field; keep it open for the paste.
    expect(view.textarea()).not.toBeNull();

    const before = view.textarea()!.value;
    await act(async () => {
      setTextareaValue(view.textarea()!, "x".repeat(MAX_ORDER_NOTES_UNITS + 40));
    });

    expect(useCheckoutStore.getState().orderNotes).toBe("short note");
    expect(view.textarea()!.value).toBe(before);
    expect(view.text()).toContain("not applied");
    expect(view.text()).toContain("clipboard is unchanged");
    view.cleanup();
  });

  it("shows an oversized legacy draft for explicit review instead of dropping it", async () => {
    useCheckoutStore.setState({
      orderNotes: "",
      legacyOrderNotes: "very old note ".repeat(30),
    });
    const view = await render();

    expect(view.text()).toContain("Saved note needs review");
    expect(view.text()).toContain("very old note");
    expect(view.text()).toContain("Keep the first 240 characters");

    await act(async () => {
      view.button("Keep the first")?.click();
    });

    expect(useCheckoutStore.getState().orderNotes.length).toBe(MAX_ORDER_NOTES_UNITS);
    expect(useCheckoutStore.getState().legacyOrderNotes).toBe("");
    view.cleanup();
  });

  it("moves a legacy item note into the order note and clears the item copy", async () => {
    seedLegacyLine();

    const view = await render();
    expect(view.text()).toContain("Notes on individual items");
    expect(view.text()).toContain("no onions");

    await act(async () => {
      view.button("Move into cooking instructions")?.click();
    });

    expect(useCheckoutStore.getState().orderNotes).toContain("no onions");
    expect(useCartStore.getState().lines[0].notes).toBeUndefined();
    expect(fixture.updateNotes).toHaveBeenCalledTimes(1);
    view.cleanup();
  });

  it("moves the note only ONCE on a double tap", async () => {
    seedLegacyLine();
    const pending = deferred<ApiResult<void>>();
    fixture.updateNotes.mockImplementation((lineId: string, notes: string) => {
      useCartStore.getState().updateNotes(lineId, notes);
      return pending.promise;
    });

    const view = await render();
    await act(async () => {
      const move = view.button("Move into cooking instructions")!;
      move.click();
      move.click();
    });

    expect(fixture.updateNotes).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(ok(undefined));
    });

    const notes = useCheckoutStore.getState().orderNotes;
    expect(notes.match(/no onions/g)).toHaveLength(1);
    view.cleanup();
  });

  it("rolls the draft back when the item note cannot be cleared, keeping it reviewable", async () => {
    seedLegacyLine();
    useCheckoutStore.getState().setOrderNotes("less spicy");
    fixture.updateNotes.mockResolvedValueOnce(fail("PERSIST_FAILED", "no write"));

    const view = await render();
    await act(async () => {
      view.button("Move into cooking instructions")?.click();
    });

    // No duplicate writer: the draft is exactly what it was, and the note is
    // still on the item for review.
    expect(useCheckoutStore.getState().orderNotes).toBe("less spicy");
    expect(lineNote()).toBe("no onions");
    expect(view.text()).toContain("still on that item");
    view.cleanup();
  });

  it("restores the item note when the clear throws after applying", async () => {
    seedLegacyLine();
    useCheckoutStore.getState().setOrderNotes("less spicy");
    fixture.updateNotes.mockImplementationOnce(async (lineId: string, notes: string) => {
      useCartStore.getState().updateNotes(lineId, notes);
      throw new Error("transport exploded");
    });

    const view = await render();
    await act(async () => {
      view.button("Move into cooking instructions")?.click();
    });

    expect(useCheckoutStore.getState().orderNotes).toBe("less spicy");
    expect(lineNote()).toBe("no onions");
    expect(view.text()).toContain("still on that item");
    view.cleanup();
  });

  it("never overwrites a newer draft written while the move is in flight", async () => {
    seedLegacyLine();
    const pending = deferred<ApiResult<void>>();
    fixture.updateNotes.mockImplementation((lineId: string, notes: string) => {
      useCartStore.getState().updateNotes(lineId, notes);
      return pending.promise;
    });

    const view = await render();
    await act(async () => {
      view.button("Move into cooking instructions")?.click();
    });

    // The customer keeps typing while the move is pending.
    act(() => {
      useCheckoutStore.getState().setOrderNotes("ring the bell twice");
    });

    await act(async () => {
      pending.resolve(ok(undefined));
    });

    // Newer draft preserved, and the item note was put back for review (it is
    // not inside the newer draft, so nothing was lost).
    expect(useCheckoutStore.getState().orderNotes).toBe("ring the bell twice");
    expect(lineNote()).toBe("no onions");
    expect(view.text()).toContain("kept on that item");
    view.cleanup();
  });

  it("keeps the instruction reviewable when the account/outlet scope changes mid-move", async () => {
    seedLegacyLine();
    useCheckoutStore.getState().bindNotesScope("uid-1", "store-A");
    useCheckoutStore.getState().setOrderNotes("less spicy");

    const pending = deferred<ApiResult<void>>();
    fixture.updateNotes.mockImplementation((lineId: string, notes: string) => {
      useCartStore.getState().updateNotes(lineId, notes);
      return pending.promise;
    });

    const view = await render();
    await act(async () => {
      view.button("Move into cooking instructions")?.click();
    });

    // Outlet switch clears the draft while the clear is in flight.
    act(() => {
      useCheckoutStore.getState().bindNotesScope("uid-1", "store-B");
    });
    expect(useCheckoutStore.getState().orderNotes).toBe("");

    await act(async () => {
      pending.resolve(ok(undefined));
    });

    expect(useCheckoutStore.getState().orderNotes).toBe("");
    // Not silently lost in a draft that no longer exists.
    expect(lineNote()).toBe("no onions");
    expect(view.text()).toContain("kept on that item");
    view.cleanup();
  });

  it("does not claim success when removing a note fails", async () => {
    seedLegacyLine();
    fixture.updateNotes.mockResolvedValueOnce(fail("PERSIST_FAILED", "no write"));

    const view = await render();
    await act(async () => {
      view.button("Remove")?.click();
    });

    expect(lineNote()).toBe("no onions");
    expect(view.text()).toContain("still on that item");
    expect(fixture.toastPlain).not.toHaveBeenCalledWith(
      expect.stringContaining("Removed"),
      expect.anything(),
    );
    view.cleanup();
  });

  it("removes a legacy item note and hides the review block", async () => {
    seedLegacyLine();

    const view = await render();
    await act(async () => {
      view.button("Remove")?.click();
    });

    expect(lineNote()).toBeUndefined();
    expect(view.text()).not.toContain("Notes on individual items");
    view.cleanup();
  });

  it("preserves the note text literally (no trim, no pipe split)", async () => {
    seedLegacyLine("  no onions | extra cheese  ");

    const view = await render();
    await act(async () => {
      view.button("Move into cooking instructions")?.click();
    });

    expect(useCheckoutStore.getState().orderNotes).toBe("  no onions | extra cheese  ");
    view.cleanup();
  });
});
