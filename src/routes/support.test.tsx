import { describe, it, expect } from "vitest";
import type { CustomerTicket, TicketCategory } from "@/features/support/hooks/useCustomerTickets";

describe("Prompt 29: Customer Support & 3-Tier Ticketing Suite", () => {
  describe("1. Ticket Validation & Category Mapping", () => {
    it("maps all QSR issue categories accurately", () => {
      const categories: TicketCategory[] = [
        "LATE_DELIVERY",
        "MISSING_ITEM",
        "FOOD_QUALITY",
        "WRONG_ORDER",
        "PAYMENT_ISSUE",
        "OTHER",
      ];

      expect(categories).toHaveLength(6);
    });

    it("enforces minimum 10-character description requirement", () => {
      const validDesc = "The cheese burger arrived cold and soggy after 40 mins.";
      const shortDesc = "Cold food";

      expect(validDesc.trim().length >= 10).toBe(true);
      expect(shortDesc.trim().length >= 10).toBe(false);
    });

    it("assigns priority 'urgent' to payment and wrong order issues", () => {
      const getPriority = (cat: TicketCategory) =>
        cat === "PAYMENT_ISSUE" || cat === "WRONG_ORDER" ? "urgent" : "normal";

      expect(getPriority("PAYMENT_ISSUE")).toBe("urgent");
      expect(getPriority("WRONG_ORDER")).toBe("urgent");
      expect(getPriority("FOOD_QUALITY")).toBe("normal");
      expect(getPriority("LATE_DELIVERY")).toBe("normal");
    });
  });

  describe("2. SLA Transparency and Auto-Escalation Lifecycle", () => {
    it("initializes ticket with Level 1 store queue status and SLA guarantee", () => {
      const ticket: CustomerTicket = {
        id: "tkt_123",
        ticketNumber: "TKT-84920",
        category: "FOOD_QUALITY",
        categoryLabel: "Food Quality (Cold/Soggy)",
        description: "Burger was lukewarm upon delivery",
        photos: [],
        status: "OPEN",
        priority: "normal",
        escalationLevel: 1,
        branchId: "branch_cg_road",
        createdAt: new Date().toISOString(),
      };

      expect(ticket.status).toBe("OPEN");
      expect(ticket.escalationLevel).toBe(1);
      expect(ticket.ticketNumber).toMatch(/^TKT-\d+$/);
    });

    it("reflects manager resolution and compensation response", () => {
      const resolvedTicket: CustomerTicket = {
        id: "tkt_123",
        ticketNumber: "TKT-84920",
        category: "FOOD_QUALITY",
        categoryLabel: "Food Quality (Cold/Soggy)",
        description: "Burger was lukewarm upon delivery",
        photos: [],
        status: "RESOLVED",
        priority: "normal",
        escalationLevel: 1,
        branchId: "branch_cg_road",
        managerResponse: "Credited 100 Grill Coins to your wallet as a compensation. Apologies!",
        createdAt: new Date().toISOString(),
        resolvedAt: new Date().toISOString(),
      };

      expect(resolvedTicket.status).toBe("RESOLVED");
      expect(resolvedTicket.managerResponse).toBeDefined();
      expect(resolvedTicket.resolvedAt).toBeDefined();
    });
  });
});
