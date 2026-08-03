/**
 * SupportService — mock implementation of the future
 *   GET  /v1/support/faqs
 *   GET  /v1/support/channels
 *   GET  /v1/support/issue-categories
 *   POST /v1/support/tickets
 *   POST /v1/support/feedback
 * endpoints. All content is repository-driven so backend teams can
 * ship FAQ / channel / category edits without a mobile release.
 */
import { delay, fail, ok, type ApiResult } from "@/core/network/http";
import type {
  FaqItem,
  FeedbackInput,
  FeedbackRecord,
  IssueCategory,
  SupportChannel,
  SupportTicket,
  SupportTicketInput,
} from "@/features/support/models";

const MOCK_FAQS: FaqItem[] = [
  {
    id: "faq_1",
    category: "Orders",
    question: "How do I track my order?",
    answer:
      "Open Orders from your Profile. Active orders show a live timeline with the current step highlighted.",
  },
  {
    id: "faq_2",
    category: "Orders",
    question: "Can I cancel an order after placing it?",
    answer:
      "You can cancel within the first minute from the tracking screen. Once the kitchen starts preparing, cancellations aren't possible.",
  },
  {
    id: "faq_3",
    category: "Payments",
    question: "Which payment methods do you accept?",
    answer:
      "UPI, credit and debit cards, net banking and popular wallets — all handled via Razorpay's secure gateway.",
  },
  {
    id: "faq_4",
    category: "Delivery",
    question: "What are your delivery hours?",
    answer:
      "Delivery hours vary by store. The store card on Home shows current status, opening hours and estimated delivery time.",
  },
  {
    id: "faq_5",
    category: "Menu",
    question: "Is every item 100% vegetarian?",
    answer:
      "Yes. Every Burgonomics kitchen is strictly 100% pure vegetarian, with zero cross-contact with non-veg ingredients.",
  },
];

const MOCK_CHANNELS: SupportChannel[] = [
  {
    id: "ch_call",
    label: "Call the store",
    kind: "call",
    value: "+911800123123",
    available: true,
    helper: "Fastest for order-day issues",
  },
  {
    id: "ch_email",
    label: "Email support",
    kind: "email",
    value: "support@burgonomics.example",
    available: true,
    helper: "We reply within one business day",
  },
  {
    id: "ch_whatsapp",
    label: "WhatsApp us",
    kind: "whatsapp",
    value: "https://wa.me/911800123123",
    available: false,
    helper: "Rolling out soon",
  },
  {
    id: "ch_chat",
    label: "Live chat",
    kind: "chat",
    available: false,
    helper: "Coming soon",
  },
  {
    id: "ch_ai",
    label: "Burg AI assistant",
    kind: "ai",
    available: false,
    helper: "Coming soon",
  },
];

const MOCK_ISSUE_CATEGORIES: IssueCategory[] = [
  { id: "order", label: "Order issue", helper: "Wrong items, missing items, quality" },
  { id: "payment", label: "Payment issue", helper: "Failed, double-charged, refund" },
  { id: "delivery", label: "Delivery issue", helper: "Late, address, courier" },
  { id: "technical", label: "Technical issue", helper: "App crashes, bugs" },
  { id: "other", label: "Something else" },
];

export const supportService = {
  async listFaqs(): Promise<ApiResult<FaqItem[]>> {
    await delay(120);
    return ok(MOCK_FAQS);
  },
  async listChannels(): Promise<ApiResult<SupportChannel[]>> {
    await delay(100);
    return ok(MOCK_CHANNELS);
  },
  async listIssueCategories(): Promise<ApiResult<IssueCategory[]>> {
    await delay(80);
    return ok(MOCK_ISSUE_CATEGORIES);
  },
  async submitTicket(input: SupportTicketInput): Promise<ApiResult<SupportTicket>> {
    await delay(200);
    if (!input.subject.trim() || !input.message.trim()) {
      return fail("INVALID_TICKET", "Please add a subject and a short message.");
    }
    return ok({
      id: `tkt_${Date.now().toString(36)}`,
      status: "open",
      createdAt: Date.now(),
      ...input,
    });
  },
  async submitFeedback(input: FeedbackInput): Promise<ApiResult<FeedbackRecord>> {
    await delay(180);
    if (!Number.isFinite(input.rating) || input.rating < 1 || input.rating > 5) {
      return fail("INVALID_RATING", "Please select a rating between 1 and 5.");
    }
    return ok({
      id: `fb_${Date.now().toString(36)}`,
      createdAt: Date.now(),
      ...input,
    });
  },
};
