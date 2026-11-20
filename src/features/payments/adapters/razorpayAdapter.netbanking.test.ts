/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * CASH-FLOWS / Android netbanking.
 *
 * OWNER-REPORT 2026-11-20 asks to "hide Android netbanking". The reason is in
 * `payments.md` Defect 4 and `10-integrations/razorpay.md:90-97`: on Android the
 * Razorpay web checkout opens netbanking in a popup / bank-intent redirect that
 * the Capacitor WebView blocks, because this shell has no Browser bridge — the
 * sheet hangs or closes before the bank page. Cards, UPI and wallets work.
 *
 * The bounded fix is to hide ONLY netbanking on Android native (Razorpay's
 * documented `config.display.hide`), leaving web and iOS untouched, until the
 * bridge exists and has been verified on a device.
 */
const captured: Record<string, unknown>[] = [];

function installSdk() {
  const Ctor = function (this: any, options: Record<string, unknown>) {
    captured.push(options);
    this.open = () => undefined;
    this.on = () => undefined;
  } as unknown as new (options: Record<string, unknown>) => {
    open: () => void;
    on: (event: string, cb: (payload: unknown) => void) => void;
  };
  (window as unknown as { Razorpay?: unknown }).Razorpay = Ctor;
}

function setPlatform(platform: "android" | "ios" | "web") {
  if (platform === "web") {
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    return;
  }
  (window as unknown as { Capacitor?: unknown }).Capacitor = {
    getPlatform: () => platform,
    isNativePlatform: () => true,
  };
}

async function openCheckout() {
  const { razorpayAdapter } = await import("@/features/payments/adapters/razorpayAdapter");
  await razorpayAdapter.initialize({
    order: {
      orderId: "order_ABCDEFGHIJKLMN",
      razorpayOrderId: "order_ABCDEFGHIJKLMN",
      keyId: "rzp_test_unit",
      amount: 115,
      amountPaise: 11500,
      currency: "INR",
      receipt: "rcpt_1",
    },
  } as never);
  await razorpayAdapter.openCheckout(
    { onSuccess: () => undefined, onFailure: () => undefined, onCancel: () => undefined },
    "netbanking",
  );
}

describe("Android netbanking is hidden at the gateway", () => {
  afterEach(() => {
    captured.length = 0;
    delete (window as unknown as { Razorpay?: unknown }).Razorpay;
    setPlatform("web");
    vi.unstubAllEnvs();
  });

  it("hides netbanking on Android native only", async () => {
    // Leave the test-runner simulation so the REAL option builder runs.
    vi.stubEnv("VITEST", "");
    vi.stubEnv("NODE_ENV", "development");
    setPlatform("android");
    installSdk();

    await openCheckout();

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      config: { display: { hide: [{ method: "netbanking" }] } },
    });
    // The rest of the gateway contract is untouched.
    expect(captured[0]).toMatchObject({ amount: 11500, currency: "INR", key: "rzp_test_unit" });
  });

  it("leaves web checkout's payment methods alone", async () => {
    vi.stubEnv("VITEST", "");
    vi.stubEnv("NODE_ENV", "development");
    setPlatform("web");
    installSdk();

    await openCheckout();

    expect(captured).toHaveLength(1);
    expect(captured[0]).not.toHaveProperty("config");
  });
});
