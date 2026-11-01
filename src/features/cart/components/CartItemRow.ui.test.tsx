/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CartLine } from "../models";
import { formatINR } from "@/core/utils/format";

vi.mock("@/core/services/haptics", () => ({ HapticService: { impact: vi.fn() } }));
vi.mock("@/core/services/audio", () => ({ AudioService: { playClick: vi.fn() } }));

import { CartItemRow } from "./CartItemRow";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const line: CartLine = {
  lineId: "sample-line",
  productId: "sample-product",
  storeId: "sample-store",
  name: "Cheese Burst Burger with a deliberately long readable name",
  imageUrl: "/images/menu/big-bang-burgers/cheese-burst-burger.jpg",
  unitPrice: 199,
  quantity: 2,
  modifiers: [],
  veg: true,
  availability: "available",
};
let host: HTMLDivElement;
let root: Root | null = null;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host?.remove();
});
async function mount(value = line) {
  const onQuantityChange = vi.fn();
  const onRemove = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <CartItemRow line={value} onQuantityChange={onQuantityChange} onRemove={onRemove} />,
    ),
  );
  return { onQuantityChange, onRemove };
}

describe("small Cart visual cleanup preserves line behaviour", () => {
  it("uses separated line items while retaining the real name, total and controls", async () => {
    const actions = await mount();
    const article = host.querySelector("article")!;
    expect(article.classList.contains("border-b")).toBe(true);
    expect(article.classList.contains("border")).toBe(false);
    expect(article.className).not.toContain("rounded-");
    expect(host.textContent).toContain(line.name);
    expect(host.textContent).toContain(formatINR(398));
    const decrement = host.querySelector<HTMLButtonElement>('[aria-label="Decrease quantity"]')!;
    const increment = host.querySelector<HTMLButtonElement>('[aria-label="Increase quantity"]')!;
    expect(decrement.className).toContain("h-11 w-11");
    expect(increment.className).toContain("h-11 w-11");
    await act(async () => decrement.click());
    await act(async () => increment.click());
    expect(actions.onQuantityChange.mock.calls).toEqual([[1], [3]]);
  });

  it("still disables quantity changes for unavailable items and allows removal", async () => {
    const actions = await mount({
      ...line,
      availability: "unavailable",
      unavailableReason: "Sold out",
    });
    expect(
      host.querySelector<HTMLButtonElement>('[aria-label="Decrease quantity"]')?.disabled,
    ).toBe(true);
    expect(
      host.querySelector<HTMLButtonElement>('[aria-label="Increase quantity"]')?.disabled,
    ).toBe(true);
    const remove = host.querySelector<HTMLButtonElement>(`[aria-label="Remove ${line.name}"]`)!;
    await act(async () => remove.click());
    expect(actions.onRemove).toHaveBeenCalledOnce();
    expect(host.querySelector("textarea")).toBeNull();
  });
});
