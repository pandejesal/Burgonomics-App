import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";

export type TicketCategory =
  | "LATE_DELIVERY"
  | "MISSING_ITEM"
  | "FOOD_QUALITY"
  | "WRONG_ORDER"
  | "PAYMENT_ISSUE"
  | "OTHER";

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "ESCALATED";

export interface CustomerTicket {
  id: string;
  ticketNumber: string;
  orderId?: string;
  orderShortCode?: string;
  category: TicketCategory;
  categoryLabel: string;
  description: string;
  photos: string[];
  status: TicketStatus;
  priority: "normal" | "urgent";
  escalationLevel: 1 | 2 | 3;
  branchId?: string;
  managerResponse?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface CreateTicketParams {
  orderId?: string;
  orderShortCode?: string;
  category: TicketCategory;
  description: string;
  photos?: string[];
  branchId?: string;
}

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  LATE_DELIVERY: "Delayed Delivery",
  MISSING_ITEM: "Missing Item in Package",
  FOOD_QUALITY: "Food Quality (Cold/Soggy)",
  WRONG_ORDER: "Wrong Item / Order Delivered",
  PAYMENT_ISSUE: "Payment / Duplicate Charge",
  OTHER: "General Query or Feedback",
};

const INITIAL_MOCK_TICKETS: CustomerTicket[] = [
  {
    id: "tkt_001",
    ticketNumber: "TKT-84920",
    orderId: "ord_102",
    orderShortCode: "BG-9921",
    category: "FOOD_QUALITY",
    categoryLabel: "Food Quality (Cold/Soggy)",
    description: "Burger arrived cold due to rain delay. Requesting replacement or refund credit.",
    photos: [],
    status: "RESOLVED",
    priority: "normal",
    escalationLevel: 1,
    branchId: "branch_ahmedabad_01",
    managerResponse: "Credited 100 Loyalty Points to your wallet as compensation. Apologies for the delay!",
    createdAt: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
    resolvedAt: new Date(Date.now() - 3600 * 1000 * 22).toISOString(),
  },
];

export function useCustomerTickets() {
  const [tickets, setTickets] = useState<CustomerTicket[]>(() => {
    // Loop 7: exact signature of the retired dev seed — purged from
    // already-persisted browsers so no prod user keeps fake history.
    // Real tickets use tkt_${Date.now()} ids: no collision possible.
    const isSeedTicket = (t: any) => t?.id === "tkt_001" && t?.ticketNumber === "TKT-84920";
    try {
      const stored = localStorage.getItem("burgonomics_customer_tickets");
      if (stored) {
        const parsed = JSON.parse(stored);
        const cleaned = Array.isArray(parsed) ? parsed.filter((t) => !isSeedTicket(t)) : [];
        return cleaned;
      }
      // Loop 7: production starts empty — the mock seed (fake RESOLVED
      // ticket + fabricated loyalty credit) is dev-only. Prod must never
      // render fabricated support history.
      return import.meta.env.DEV ? INITIAL_MOCK_TICKETS : [];
    } catch {
      return import.meta.env.DEV ? INITIAL_MOCK_TICKETS : [];
    }
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("burgonomics_customer_tickets", JSON.stringify(tickets));
    } catch (e) {
      console.warn("Failed to persist tickets:", e);
    }
  }, [tickets]);

  const createTicket = useCallback(
    async (params: CreateTicketParams): Promise<{ success: boolean; ticket?: CustomerTicket }> => {
      if (!params.category) {
        toast.error("Please select an issue category");
        return { success: false };
      }
      if (!params.description || params.description.trim().length < 10) {
        toast.error("Please describe your issue (at least 10 characters)");
        return { success: false };
      }

      setIsSubmitting(true);
      try {
        const ticketNum = `TKT-${Math.floor(10000 + Math.random() * 90000)}`;
        const newTicket: CustomerTicket = {
          id: `tkt_${Date.now()}`,
          ticketNumber: ticketNum,
          orderId: params.orderId,
          orderShortCode: params.orderShortCode || params.orderId?.slice(-6).toUpperCase(),
          category: params.category,
          categoryLabel: CATEGORY_LABELS[params.category],
          description: params.description.trim(),
          photos: params.photos || [],
          status: "OPEN",
          priority: params.category === "PAYMENT_ISSUE" || params.category === "WRONG_ORDER" ? "urgent" : "normal",
          escalationLevel: 1,
          // Loop: no fabricated branch default — a ticket with no store
          // context stays branch-less rather than stamped to a wrong outlet.
          branchId: params.branchId || undefined,
          createdAt: new Date().toISOString(),
        };

        setTickets((prev) => [newTicket, ...prev]);
        // Loop: honest copy — tickets persist on-device only until the server
        // inbox ships (no one is notified yet; no 15-minute promise).
        toast.success(`Support Ticket #${ticketNum} saved on this device. Our team inbox is coming soon — for urgent help, contact the store directly.`);
        return { success: true, ticket: newTicket };
      } catch (err) {
        toast.error("Failed to submit support ticket");
        return { success: false };
      } finally {
        setIsSubmitting(false);
      }
    },
    []
  );

  return {
    tickets,
    isSubmitting,
    createTicket,
    categoryLabels: CATEGORY_LABELS,
  };
}

export default useCustomerTickets;
