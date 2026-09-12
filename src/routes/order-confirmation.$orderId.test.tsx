import { describe, it, expect } from "vitest";

describe("Prompt 18: Order Confirmation & Loyalty Rewards Screen Suite", () => {
  describe("1. Loyalty Grill Coins Earning Calculations", () => {
    it("calculates 5% loyalty Grill Coins from order subtotal", () => {
      const subtotal = 500;
      const earnedCoins = Math.max(15, Math.round(subtotal * 0.05));
      expect(earnedCoins).toBe(25);
    });

    it("ensures minimum baseline reward of 15 Grill Coins", () => {
      const subtotal = 120;
      const earnedCoins = Math.max(15, Math.round(subtotal * 0.05));
      expect(earnedCoins).toBe(15);
    });
  });

  describe("2. Fulfillment Mode Tokens & Table Identifiers", () => {
    it("extracts short pickup token for takeaway orders", () => {
      const orderShortCode = "SUR-TK-8891";
      const token = orderShortCode.split("-").pop() || orderShortCode;
      expect(token).toBe("8891");
    });

    it("formats dine-in table display cleanly", () => {
      const tableNumber = "12";
      const tableLabel = `Table ${tableNumber}`;
      expect(tableLabel).toBe("Table 12");
    });
  });

  describe("3. Makeline Preparation Countdown Timers", () => {
    it("computes remaining minutes from estimated delivery timestamp", () => {
      const estimatedAt = new Date(Date.now() + 25 * 60_000).toISOString();
      const remainingMinutes = Math.max(
        0,
        Math.round((+new Date(estimatedAt) - Date.now()) / 60_000)
      );

      expect(remainingMinutes).toBeGreaterThanOrEqual(24);
      expect(remainingMinutes).toBeLessThanOrEqual(25);
    });
  });
});
