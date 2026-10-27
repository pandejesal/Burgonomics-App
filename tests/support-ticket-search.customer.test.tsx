import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { validateSupportSearch } from "../src/features/support/utils/supportSearch";
import {
  parseNotificationRefSearch,
  resolveInboxNavigation,
} from "../src/features/notifications/utils/notificationRouting";
import { TicketListAccordion } from "../src/features/support/components/TicketListAccordion";
import type { CustomerTicket } from "../src/features/support/hooks/useCustomerTickets";

/**
 * C-05 — `ticketId` search param + `initialOpenId`, and `?ref=` parsing that
 * survives the signed-out redirect (the router keeps the validated search).
 */
const ticket: CustomerTicket = {
  id: "tkt_123",
  ticketNumber: "TKT-123",
  category: "LATE_DELIVERY",
  categoryLabel: "Delayed Delivery",
  description: "Arrived late",
  photos: [],
  status: "OPEN",
  priority: "normal",
  escalationLevel: 1,
  createdAt: "2026-10-01T10:00:00.000Z",
};

describe("C-05 support ticket search", () => {
  it("accepts a push ticketId and keeps the existing search params", () => {
    expect(
      validateSupportSearch({
        ticketId: "tkt_123",
        topic: "payment",
        paymentId: "pay_1",
        orderId: "ord_1",
        message: "help",
      }),
    ).toEqual({
      ticketId: "tkt_123",
      topic: "payment",
      paymentId: "pay_1",
      orderId: "ord_1",
      message: "help",
    });
  });

  it("rejects an unsafe ticketId instead of putting it in the URL", () => {
    expect(validateSupportSearch({ ticketId: "bad id/../" }).ticketId).toBeUndefined();
    expect(validateSupportSearch({ ticketId: "tkt_123" }).ticketId).toBe("tkt_123");
  });

  it("opens the matching ticket from initialOpenId", () => {
    const withOpen = renderToStaticMarkup(
      <TicketListAccordion
        tickets={[ticket]}
        onOpenNewTicket={() => undefined}
        initialOpenId="tkt_123"
      />,
    );
    expect(withOpen).toContain("Opened");
    expect(withOpen).toContain("TKT-123");

    const withoutOpen = renderToStaticMarkup(
      <TicketListAccordion tickets={[ticket]} onOpenNewTicket={() => undefined} />,
    );
    expect(withoutOpen).not.toContain("Opened");
  });
});

describe("C-05 profile notifications ?ref= parsing", () => {
  it("preserves a valid inbox ref through route search validation", () => {
    expect(parseNotificationRefSearch({ ref: "ref_abc-123" })).toEqual({
      ref: "ref_abc-123",
    });
  });

  it("drops an invalid ref rather than navigating from it", () => {
    expect(parseNotificationRefSearch({ ref: "/evil" })).toEqual({});
    expect(parseNotificationRefSearch({ ref: "a b" })).toEqual({});
    expect(parseNotificationRefSearch({})).toEqual({});
  });

  it("returns structured TanStack targets (search/params, not a query in `to`)", () => {
    expect(resolveInboxNavigation("supportReplies", "tkt_123")).toEqual({
      to: "/support",
      search: { ticketId: "tkt_123" },
    });
    expect(resolveInboxNavigation("orderUpdates", "ord_42")).toEqual({
      to: "/orders/$orderId/track",
      params: { orderId: "ord_42" },
    });
    expect(resolveInboxNavigation("orderUpdates", undefined)).toEqual({
      to: "/profile/notifications",
    });
  });
});
