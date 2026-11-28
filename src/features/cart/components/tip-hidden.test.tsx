/** @vitest-environment jsdom */
/**
 * Owner decision 2026-11-25 #1 / A6-c11 item 2: the delivery tip is HIDDEN at
 * launch.
 *
 * The tip was shown on the cart, on checkout, in the payment "To Pay" and on the
 * receipt, was promised to the rider, and was never charged by the gateway nor
 * collected in cash — plus it raised a bogus "your total changed" dialog on
 * every tipped order.
 *
 * These assertions are on RENDERED output and on the REAL POST bodies, so a
 * revert of either the UI half or the payload half fails. The last case is a
 * structural check: the retired selector may still exist (its own tests are not
 * deleted) but no shipped route or component may mount it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ok } from "@/core/network/http";

import { BillBreakdown } from "@/features/cart/components/BillBreakdown";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import { formatINR } from "@/core/utils/format";

const cash = vi.hoisted(() => ({ createCashOrderOnServer: vi.fn() }));
const draft = vi.hoisted(() => ({ createOnlineDraftOnServer: vi.fn() }));
const service = vi.hoisted(() => ({ getOrder: vi.fn() }));
const cartRepo = vi.hoisted(() => ({ calculateTotals: vi.fn() }));

vi.mock("@/features/payments/services/cashOrderService", () => ({
  ...cash,
  CREATE_CASH_ORDER_PATH: "/orders/createCashOrder",
  createCashOrderUrl: () => "http://x/orders/createCashOrder",
}));
vi.mock("@/features/payments/services/onlineDraftService", () => ({
  createOnlineDraftOnServer: draft.createOnlineDraftOnServer,
  retireOnlineDraftOnServer: vi.fn(async () => ok(null)),
}));
vi.mock("@/features/orders/services/ordersService", () => ({ ordersService: service }));
vi.mock("@/features/cart/repositories/CartRepository", () => ({
  cartRepository: cartRepo,
  CartRepository: class {},
}));

import { OrderRepository } from "@/features/orders/repositories/OrderRepository";
import { useCartStore } from "@/features/cart/state/cartStore";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { configureAuthUidSource } from "@/features/auth/utils/scopedPersistence";
import type { CartTotals } from "@/features/cart/models";

function toPayAmount(html: string): string {
  const match = html.match(/To Pay<\/span><span[^>]*>([\s\S]*?)<\/span>/);
  return match ? match[1].trim() : "";
}

const totals: CartTotals = {
  subtotal: 100,
  itemDiscount: 0,
  promoDiscount: 0,
  taxes: 4.76,
  cgst: 2.38,
  sgst: 2.38,
  gstRate: 0.05,
  deliveryFee: 0,
  packingFee: 15,
  grandTotal: 119,
  currency: "INR",
};

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    // Web Lock API fidelity: both request(name, callback) and
    // request(name, options, callback). Uncontended fixture grants the lock.
    value: {
      request: async (_key: string, optionsOrClaim: any, maybeClaim?: any) => {
        const claim = maybeClaim ?? optionsOrClaim;
        return claim({ name: _key, mode: "exclusive", ifAvailable: false, steal: false });
      },
    },
  });
  cash.createCashOrderOnServer.mockReset();
  draft.createOnlineDraftOnServer.mockReset();
  service.getOrder.mockReset();
  cartRepo.calculateTotals.mockReset();
  cartRepo.calculateTotals.mockResolvedValue(ok(totals));
  cash.createCashOrderOnServer.mockImplementation(async (request: { orderId: string }) =>
    ok({
      orderId: request.orderId,
      replayed: false,
      paymentMethod: "cod",
      paymentChannel: "cash",
      cashDuePaise: 11900,
      totals: {},
      status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
    }),
  );
  draft.createOnlineDraftOnServer.mockImplementation(async (request: { orderId: string }) =>
    ok({ orderId: request.orderId, amountPaise: 11900, replayed: false }),
  );
  service.getOrder.mockResolvedValue(ok({ id: "ord_tip" }));
  useCartStore.setState({
    lines: [
      {
        lineId: "l1",
        productId: "p1",
        storeId: "s1",
        name: "Burger",
        unitPrice: 100,
        quantity: 1,
        modifiers: [],
        availability: "available",
      },
    ],
    storeId: "s1",
    status: "ready",
  });
  useStoreSelection.setState({
    activeStore: { id: "s1", name: "S" } as never,
    fulfillment: "takeaway",
  });
  useCheckoutStore.getState().reset();
  configureAuthUidSource({ getUid: () => "cust_tip", subscribe: () => () => {} });
});

describe("delivery tip is hidden (owner decision 2026-11-25 #1)", () => {
  it("prints no tip row and no tip in the bill total", () => {
    // A legacy caller that still passes a tip cannot bring the row back.
    const html = renderToStaticMarkup(
      <BillBreakdown
        subtotal={400}
        discountAmount={50}
        gstAmount={20}
        packagingFee={20}
        deliveryFee={0}
        {...({ tipAmount: 20 } as object)}
        fulfillment="delivery"
      />,
    );

    expect(html).not.toMatch(/delivery partne?r tip/i);
    // 400 - 50 + 20 + 0 = 370: the extra ₹20 must not be added.
    expect(toPayAmount(html)).toBe(formatINR(370));
  });

  it("defaults the checkout tip to zero and never restores a legacy amount", () => {
    expect(useCheckoutStore.getState().tipAmount).toBe(0);

    // A legacy persisted value must not survive a rehydrate.
    window.localStorage.setItem(
      "burg.checkout",
      JSON.stringify({ state: { tipAmount: 60 }, version: 1 }),
    );
    expect(useCheckoutStore.getState().tipAmount).toBe(0);
  });

  it("sends no tipAmount in the cash order payload", async () => {
    useCheckoutStore.getState().setTipAmount(40);

    await new OrderRepository(service as never).createCashOrder();

    expect(cash.createCashOrderOnServer).toHaveBeenCalledTimes(1);
    const posted = cash.createCashOrderOnServer.mock.calls[0][0] as Record<string, unknown>;
    expect(posted.tipAmount).toBeUndefined();
    expect(posted.expectedTotalPaise).toBe(11900);
  });

  it("sends no tipAmount in the online draft payload", async () => {
    useCheckoutStore.getState().setTipAmount(40);

    await new OrderRepository(service as never).createOnlineDraft();

    expect(draft.createOnlineDraftOnServer).toHaveBeenCalledTimes(1);
    const posted = draft.createOnlineDraftOnServer.mock.calls[0][0] as Record<string, unknown>;
    expect("tipAmount" in posted).toBe(false);
  });

  it("mounts the retired tip selector in no route or component", () => {
    const root = process.cwd();
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry)) continue;
        // Tests may legitimately reference the component; shipped code may not.
        if (/\.test\.(ts|tsx)$/.test(entry)) continue;
        if (entry === "DeliveryTipSelector.tsx") continue;
        if (/DeliveryTipSelector\.target\.test/.test(entry)) continue;
        const source = readFileSync(full, "utf8");
        if (/DeliveryTipSelector/.test(source)) offenders.push(full.replace(root, ""));
      }
    };
    walk(join(root, "src"));

    // The only legitimate mention is the barrel re-export in features/cart.
    const allowed = join("src", "features", "cart", "index.ts");
    expect(offenders.filter((p) => p.replace(/^[\\/]/, "") !== allowed)).toEqual([]);
  });
});
