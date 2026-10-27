/**
 * Support route search validation. `ticketId` is a push/inbox deep link into
 * the ticket accordion; the id alphabet is enforced because it becomes a URL
 * query value (same rule the push router applies).
 */
export const SAFE_SUPPORT_TICKET_ID = /^[\w-]{1,64}$/;

export interface SupportSearch {
  topic?: string;
  paymentId?: string;
  orderId?: string;
  message?: string;
  ticketId?: string;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function validateSupportSearch(search: Record<string, unknown>): SupportSearch {
  const ticketId =
    typeof search.ticketId === "string" && SAFE_SUPPORT_TICKET_ID.test(search.ticketId)
      ? search.ticketId
      : undefined;
  return {
    topic: optionalString(search.topic),
    paymentId: optionalString(search.paymentId),
    // Order-context deep link (MT-08): the tracking page routes customers here
    // with the order id so the ticket can be traced without retyping it.
    orderId: optionalString(search.orderId),
    message: optionalString(search.message),
    ticketId,
  };
}
