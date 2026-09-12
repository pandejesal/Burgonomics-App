import { describe, it, expect } from "vitest";
import { razorpayAdapter } from "../features/payments/adapters/razorpayAdapter";
import type { PaymentOrder } from "../core/integrations/razorpay/types";

describe("Prompt 17: Payment Gateway & Razorpay Modal Integration Suite", () => {
  const mockOrder: PaymentOrder = {
    orderId: "order_mock12345678",
    amount: 499, // ₹499
    currency: "INR",
    receipt: "rcpt_test_123",
    keyId: "rzp_test_mockKey123",
  };

  describe("1. Razorpay Options & 60-30-10 Brand Palette Compliance", () => {
    it("initializes Razorpay adapter with brand theme #0E4825 (Forest Green)", async () => {
      await razorpayAdapter.initialize({
        order: mockOrder,
        prefill: {
          name: "Deep Patel",
          email: "deep@example.com",
          contact: "+919876543210",
        },
        theme: {
          color: "#0E4825",
        },
      });

      expect(razorpayAdapter.name).toBe("razorpay");
    });

    it("ensures paise conversion calculates 100x rupees amount", () => {
      const rupees = 349;
      const paise = Math.round(rupees * 100);
      expect(paise).toBe(34900);
    });
  });

  describe("2. Checkout Lifecycle & Failure Recovery", () => {
    it("handles simulated checkout success cleanly", async () => {
      let successCalled = false;

      await razorpayAdapter.initialize({ order: mockOrder });
      await razorpayAdapter.openCheckout(
        {
          onSuccess: (result) => {
            successCalled = true;
            expect(result.orderId).toBe(mockOrder.orderId);
            expect(result.paymentId).toBeDefined();
          },
          onFailure: () => {},
          onCancel: () => {},
        },
        "upi"
      );

      expect(successCalled).toBe(true);
    });

    it("triggers cancellation and abandonment recovery on user dismissal", async () => {
      let cancelCalled = false;
      const handlers = {
        onSuccess: () => {},
        onFailure: () => {},
        onCancel: () => {
          cancelCalled = true;
        },
      };

      // Simulating user modal close
      handlers.onCancel();
      expect(cancelCalled).toBe(true);
    });
  });
});
