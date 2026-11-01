/**
 * Issue categories for the Report Issue form — served from LOCAL app data, not
 * a network call.
 *
 * There is no GET /v1/support/issue-categories route (the /v1/support/* family
 * never existed), so the old repository call only produced a loading spinner
 * and then an error on a page every App Store reviewer opens.
 *
 * Nothing is invented here: the category set IS the app's own `TicketCategory`
 * vocabulary from useCustomerTickets — the same one CreateTicketForm renders
 * and the same one the backend's ticketCategorySchema accepts.
 */
import type { TicketCategory } from "@/features/support/hooks/useCustomerTickets";
import type { IssueCategory } from "@/features/support/models";

/**
 * The app's ticket categories in the order the picker presents them, with the
 * short helper the Help screen shows under each. `code` is the canonical
 * TicketCategory, so there is no second vocabulary to drift from.
 */
const CATEGORIES: { code: TicketCategory; label: string; helper: string }[] = [
  {
    code: "LATE_DELIVERY",
    label: "Delayed Delivery",
    helper: "Your order is taking longer than expected.",
  },
  {
    code: "MISSING_ITEM",
    label: "Missing Item",
    helper: "Something from your order didn't arrive.",
  },
  {
    code: "FOOD_QUALITY",
    label: "Cold / Soggy Food",
    helper: "The food arrived cold, soggy, or damaged.",
  },
  {
    code: "WRONG_ORDER",
    label: "Wrong Item Delivered",
    helper: "You received something you didn't order.",
  },
  {
    code: "PAYMENT_ISSUE",
    label: "Payment / Charge Issue",
    helper: "A payment failed, was charged twice, or needs a refund.",
  },
  {
    code: "OTHER",
    label: "General Feedback",
    helper: "Anything else you'd like to tell us.",
  },
];

/**
 * The local category list. `id` carries the canonical TicketCategory code, so a
 * consumer can hand it straight back to CreateTicketForm.
 */
export const LOCAL_ISSUE_CATEGORIES: IssueCategory[] = CATEGORIES.map((c) => ({
  id: c.code,
  label: c.label,
  helper: c.helper,
}));

/** The canonical TicketCategory codes, in presentation order. */
export const LOCAL_CATEGORY_CODES: TicketCategory[] = CATEGORIES.map((c) => c.code);
