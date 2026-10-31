/** @vitest-environment jsdom */
import * as React from "react";
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search: _search,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; search?: unknown }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/core/services/haptics", () => ({
  HapticService: { selection: vi.fn(), impact: vi.fn() },
}));

import { BillBreakdown } from "@/features/cart/components/BillBreakdown";
import { DeliveryTipSelector } from "@/features/cart/components/DeliveryTipSelector";
import { AddressSelector } from "./AddressSelector";
import { OrderTypeToggle } from "./OrderTypeToggle";
import { PaymentMethodSelector } from "./PaymentMethodSelector";
import { formatINR } from "@/core/utils/format";
import type { Address } from "@/features/addresses/models";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const CART = "src/features/cart/components";
const CHECKOUT = "src/features/checkout/components";

const SOURCES = {
  FloatingCartBar: readFileSync(`${CART}/FloatingCartBar.tsx`, "utf8"),
  BillBreakdown: readFileSync(`${CART}/BillBreakdown.tsx`, "utf8"),
  DeliveryTipSelector: readFileSync(`${CART}/DeliveryTipSelector.tsx`, "utf8"),
  OrderTypeToggle: readFileSync(`${CHECKOUT}/OrderTypeToggle.tsx`, "utf8"),
  FulfillmentDetailsCard: readFileSync(`${CHECKOUT}/FulfillmentDetailsCard.tsx`, "utf8"),
  PaymentMethodSelector: readFileSync(`${CHECKOUT}/PaymentMethodSelector.tsx`, "utf8"),
  AddressSelector: readFileSync(`${CHECKOUT}/AddressSelector.tsx`, "utf8"),
  QuickAuthSheet: readFileSync(`${CHECKOUT}/QuickAuthSheet.tsx`, "utf8"),
  CartRoute: readFileSync("src/routes/cart.tsx", "utf8"),
  CheckoutRoute: readFileSync("src/routes/checkout.tsx", "utf8"),
  CartItemRow: readFileSync(`${CART}/CartItemRow.tsx`, "utf8"),
  PromoInput: readFileSync(`${CART}/PromoInput.tsx`, "utf8"),
  KitchenClosedBanner: readFileSync(
    "src/shared/components/feedback/KitchenClosedBanner.tsx",
    "utf8",
  ),
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(ui: React.ReactElement) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(ui));
}

function buttonByText(text: string): HTMLButtonElement {
  const match = Array.from(host!.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    button.textContent?.includes(text),
  );
  if (!match) throw new Error(`Missing button: ${text}`);
  return match;
}

const address: Address = {
  id: "addr-long",
  label: "home",
  line1: "Flat 1204, Very Long Residency Name, Near The Big Landmark",
  line2: "Satellite Road, Ahmedabad",
  city: "Ahmedabad",
  pincode: "380015",
  isDefault: true,
};

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host = null;
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("checkout and cart readability", () => {
  it.each(Object.entries(SOURCES))(
    "%s uses semantic colours and readable type, not raw brand hex / tiny uppercase copy",
    (_name, source) => {
      for (const banned of [
        "#FF6600",
        "#0E4825",
        "#4ADE80",
        "#e05a00",
        "#0b381d",
        "font-black",
        "uppercase",
        "truncate",
        "text-[9px]",
        "text-[10px]",
        "text-[11px]",
        "text-xs",
        "text-white",
        "emerald",
        "amber",
      ]) {
        expect(source).not.toContain(banned);
      }
    },
  );

  it("keeps bill totals readable and aligned without truncation", () => {
    const html = renderToStaticMarkup(
      <BillBreakdown
        subtotal={123456}
        discountAmount={100}
        gstAmount={6172.8}
        packagingFee={20}
        deliveryFee={40}
        tipAmount={20}
        fulfillment="delivery"
      />,
    );

    expect(html).toContain("Inclusive of all taxes (5% GST)");
    expect(html).toContain(formatINR(123456));
    expect(html).toContain(formatINR(123436));
    expect(html).toMatch(/To Pay<\/span><span[^>]*class="[^"]*whitespace-nowrap[^"]*"/);
    expect(html).not.toContain("truncate");
  });

  it("exposes payment methods as keyboard-operable radios", async () => {
    const onSelect = vi.fn();
    await mount(<PaymentMethodSelector selectedMethod="upi" onSelectMethod={onSelect} />);

    const options = host!.querySelectorAll<HTMLButtonElement>('button[role="radio"]');
    expect(options).toHaveLength(2);
    expect(options[0].getAttribute("aria-checked")).toBe("true");

    await act(async () => options[1].click());
    expect(onSelect).toHaveBeenCalledWith("cash");
  });

  it("keeps all three order types at 44px+ and switches mode", async () => {
    const onChange = vi.fn();
    await mount(<OrderTypeToggle value={null} onChange={onChange} subtotal={0} />);

    const options = host!.querySelectorAll<HTMLButtonElement>('button[role="radio"]');
    expect(options).toHaveLength(3);
    for (const option of options) expect(option.className).toContain("min-h-[104px]");

    await act(async () => buttonByText("Takeaway").click());
    expect(onChange).toHaveBeenCalledWith("takeaway");
  });

  it("keeps tip presets at 44px+ and preserves selection semantics", async () => {
    const onSelect = vi.fn();
    await mount(<DeliveryTipSelector selectedTip={0} onSelectTip={onSelect} />);

    const tipButtons = Array.from(host!.querySelectorAll<HTMLButtonElement>("button")).filter(
      (button) => /^₹(10|20|30|50)$/.test(button.textContent ?? ""),
    );
    expect(tipButtons).toHaveLength(4);
    for (const button of tipButtons) expect(button.className).toContain("min-h-[44px]");

    await act(async () => buttonByText("₹20").click());
    expect(onSelect).toHaveBeenCalledWith(20);
  });

  it("keeps the full address readable without nesting edit links inside its radio", async () => {
    const onSelect = vi.fn();
    await mount(
      <AddressSelector
        addresses={[address]}
        selectedAddress={null}
        activeStore={null}
        onSelectAddress={onSelect}
      />,
    );

    expect(host!.textContent).toContain(address.line1);
    const card = host!.querySelector<HTMLButtonElement>('button[role="radio"]');
    expect(card).not.toBeNull();
    expect(card!.querySelector("a,button")).toBeNull();
    expect(host!.querySelector('a[href="/addresses/create"]')).not.toBeNull();

    await act(async () => card!.click());
    expect(onSelect).toHaveBeenCalledWith(address);
  });

  it("does not advertise retired app loyalty rewards in the login sheet", () => {
    expect(SOURCES.QuickAuthSheet).not.toMatch(
      /Get 50 welcome points|welcome points on your first order/,
    );
  });
});
