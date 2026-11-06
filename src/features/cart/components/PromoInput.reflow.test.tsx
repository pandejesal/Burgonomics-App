/** @vitest-environment jsdom */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PromoInput } from "./PromoInput";

vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("@/features/cart/repositories/CartRepository", () => ({ cartRepository: { applyPromo: vi.fn(), removePromo: vi.fn() } }));
vi.mock("@/shared/components/common/AppButton", () => ({
  AppButton: ({ children, type, disabled }: { children: React.ReactNode; type?: "submit"; disabled?: boolean }) => <button type={type} disabled={disabled}>{children}</button>,
}));
function render() {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<PromoInput applied={null} onChanged={vi.fn()} />);
  return host;
}
describe("coupon entry can reflow without collapsing the input at 180 CSS pixels", () => {
  it("allows the Apply action to wrap outside the input's label", () => {
    const host = render(), label = host.querySelector("label")!;
    expect(label.parentElement!.className.split(/\s+/)).toContain("flex-wrap");
    expect(label.querySelector('button[type="submit"]')).toBeNull();
    expect(label.parentElement!.querySelector('button[type="submit"]')).not.toBeNull();
  });
  it("gives the input group a nonzero wrapping basis and a nonshrinking icon", () => {
    const host = render(), input = host.querySelector("input")!, label = input.closest("label")!;
    expect(label.className).toContain("flex-[1_1_8rem]");
    expect(label.querySelector("svg")!.className.baseVal).toContain("shrink-0");
    expect(input.getAttribute("aria-label")).toBe("Coupon code");
  });
  it("keeps the empty-code Apply action disabled", () => {
    expect(render().querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
  });
});
