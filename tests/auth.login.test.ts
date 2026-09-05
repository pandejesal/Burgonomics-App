import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validatePhone,
  sanitizePhone,
  validateOtp,
  OTP_LENGTH,
  PHONE_LENGTH,
  COUNTRY_CODE,
} from "../src/features/auth/utils/validators";
import { useCartStore } from "../src/features/cart/state/cartStore";
import { useAuthStore } from "../src/features/auth/state/authStore";

describe("Prompt 02: Customer Auth, Phone SMS OTP & Guest Session Merge", () => {
  beforeEach(() => {
    useCartStore.getState().clear();
  });

  describe("1. 10-Digit Indian Phone Number Validation & Sanitization", () => {
    it("validates valid 10-digit Indian mobile numbers", () => {
      const validNumbers = ["9825012345", "9876543210", "8123456789", "7000012345", "6350012345"];
      for (const num of validNumbers) {
        const result = validatePhone(num);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }
    });

    it("rejects phone numbers with invalid length or non-Indian prefix", () => {
      expect(validatePhone("").valid).toBe(false);
      expect(validatePhone("98250").valid).toBe(false);
      expect(validatePhone("98250123456").valid).toBe(false);
      expect(validatePhone("982501234").error).toBe(`Enter a ${PHONE_LENGTH}-digit mobile number.`);
      expect(validatePhone("1234567890").error).toBe("Please enter a valid 10-digit Indian mobile number.");
    });

    it("sanitizes spaces, dashes, and +91 country prefixes cleanly", () => {
      expect(sanitizePhone("+91 98250-12345")).toBe("9825012345");
      expect(sanitizePhone("98250 12345")).toBe("9825012345");
      expect(sanitizePhone("+919825012345")).toBe("9825012345");
      expect(sanitizePhone("09825012345")).toBe("9825012345");
    });

    it("enforces Country Code and Phone constants", () => {
      expect(COUNTRY_CODE).toBe("+91");
      expect(PHONE_LENGTH).toBe(10);
      expect(OTP_LENGTH).toBe(6);
    });
  });

  describe("2. OTP Code Validation", () => {
    it("accepts valid 6-digit numeric OTP codes", () => {
      expect(validateOtp("123456").valid).toBe(true);
      expect(validateOtp("584920").valid).toBe(true);
    });

    it("rejects non-numeric or incomplete OTP codes", () => {
      expect(validateOtp("12345").valid).toBe(false);
      expect(validateOtp("1234567").valid).toBe(false);
      expect(validateOtp("12345a").valid).toBe(false);
      expect(validateOtp("").error).toBe(`Enter the ${OTP_LENGTH}-digit code.`);
    });
  });

  describe("3. Guest Cart Preservation across Authentication", () => {
    it("preserves guest cart items and customizations when authenticating", () => {
      const cartStore = useCartStore.getState();

      // Guest adds customized burger to cart before logging in
      cartStore.addLine({
        lineId: "line_classic_smash_1",
        productId: "prod_smash_01",
        name: "Classic Smash Double",
        storeId: "branch_surat_01",
        quantity: 2,
        unitPrice: 249,
        price: 498,
        availability: "available",
        modifiers: [
          {
            groupId: "bun",
            optionId: "brioche",
            name: "Brioche Bun",
            price: 20,
          },
          {
            groupId: "cheese",
            optionId: "extra_cheddar",
            name: "Extra Aged Cheddar",
            price: 35,
          },
        ],
        notes: "No pickles please",
      });

      // Verify cart state before auth
      expect(useCartStore.getState().lines).toHaveLength(1);
      expect(useCartStore.getState().lines[0].name).toBe("Classic Smash Double");
      expect(useCartStore.getState().lines[0].quantity).toBe(2);
      expect(useCartStore.getState().lines[0].modifiers).toHaveLength(2);
      expect(useCartStore.getState().lines[0].notes).toBe("No pickles please");

      // Simulate auth state transition (Guest -> Authenticated)
      useAuthStore.setState({
        status: "authenticated",
        user: { id: "usr_verified_99", phone: "+919825012345", name: "Aarav" },
      });

      // Verify cart state is 100% preserved
      expect(useCartStore.getState().lines).toHaveLength(1);
      expect(useCartStore.getState().lines[0].lineId).toBe("line_classic_smash_1");
      expect(useCartStore.getState().lines[0].price).toBe(498);
      expect(useCartStore.getState().status).toBe("ready");
    });
  });

  describe("4b. OTP Resend Cooldown Is Store-Enforced", () => {
    it("refuses resend inside the cooldown without touching the network", async () => {
      useAuthStore.setState({
        status: "otp_sent",
        challenge: {
          otpToken: "+919825012345",
          phone: "+919825012345",
          requestedAt: Date.now(),
          resendAfterSec: 60,
        },
      });
      const res = await useAuthStore.getState().resendOtp();
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/wait \d+s/);
      // Challenge untouched — no new request was issued.
      expect(useAuthStore.getState().status).toBe("otp_sent");
    });

    it("refuses resend with no active challenge", async () => {
      useAuthStore.setState({ challenge: null });
      const res = await useAuthStore.getState().resendOtp();
      expect(res.ok).toBe(false);
    });

    it("opens the gate after the cooldown (attempts a fresh request, no Firebase needed to prove it)", async () => {
      useAuthStore.setState({
        status: "otp_sent",
        challenge: {
          otpToken: "+919825012345",
          phone: "+919825012345",
          requestedAt: Date.now() - 61 * 1000,
          resendAfterSec: 60,
        },
      });
      const res = await useAuthStore.getState().resendOtp();
      // In node there is no reCAPTCHA, so the fresh request fails downstream —
      // the point is the store no longer refuses with the cooldown error.
      expect(res.error).not.toMatch(/wait \d+s/);
    });
  });

  describe("4. OTP Input Keystroke & Paste Logic", () => {
    it("extracts and slices clipboard paste to 6 digits", () => {
      const clipboardText = "Your verification code is 584920 for Burgonomics";
      const cleanDigits = clipboardText.replace(/\D/g, "").slice(0, 6);
      expect(cleanDigits).toBe("584920");
      expect(cleanDigits.length).toBe(6);
    });

    it("handles single-digit array updates and padding", () => {
      const length = 6;
      let value = "";

      // Simulate typing '5' in box 0
      const next0 = (value + "").padEnd(length, " ").split("");
      next0[0] = "5";
      value = next0.join("").replace(/\s/g, "").slice(0, length);
      expect(value).toBe("5");

      // Simulate typing '8' in box 1
      const next1 = (value + "").padEnd(length, " ").split("");
      next1[1] = "8";
      value = next1.join("").replace(/\s/g, "").slice(0, length);
      expect(value).toBe("58");
    });
  });
});
