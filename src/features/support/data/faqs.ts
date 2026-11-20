/**
 * Help centre FAQs — LOCAL content, no network call, nothing invented.
 *
 * There is no GET /v1/support/faqs route (the /v1/support/* family never
 * existed), so the old call only produced a spinner and then an error on the
 * page every App Store reviewer opens.
 *
 * HARD RULE: every answer below restates something the app already says or
 * already does. Each item cites its source; if a fact is not stated somewhere
 * in the app, the question is not here. Notably ABSENT (deliberately):
 *  - delivery areas or serviceable pin codes (the app only says delivery is
 *    unavailable when no courier can serve the address)
 *  - delivery time estimates (no promised timeline exists anywhere)
 *  - any promised refund turnaround beyond what Terms already says
 *  - phone / WhatsApp / support hours (no such values exist in app config)
 */
import type { FaqItem } from "@/features/support/models";

export const LOCAL_FAQS: FaqItem[] = [
  {
    id: "faq-pricing-gst",
    category: "Pricing",
    question: "Do the prices include GST?",
    // Source: terms.tsx §2 "Pricing, Taxes & Delivery".
    answer:
      "Yes. All prices are in Indian Rupees and already include GST at 5% (CGST 2.5% + SGST 2.5%). " +
      "GST appears on your bill for information and is never added on top.",
  },
  {
    id: "faq-charges-breakup",
    category: "Pricing",
    question: "What makes up my total?",
    // Source: legalContent.ts § terms/pricing — item total less coupon, plus
    // packaging and delivery fee (and an optional rider tip) is what you pay.
    answer:
      "Checkout shows the full breakup before you pay: your item total, less any coupon discount, " +
      "plus packaging and any delivery fee, plus an optional rider tip if you add one — that is the " +
      "amount you pay. GST is already inside the item prices and is never added on top. " +
      "The packaging charge is set by the outlet.",
  },
  {
    id: "faq-delivery-fee",
    category: "Delivery",
    question: "How is the delivery fee decided?",
    // Source: terms.tsx §2 — live courier quote for address and order.
    answer:
      "The delivery fee is a live price from our delivery partner for your address and that specific order, " +
      "and it is shown before you pay. If no delivery partner can serve your address, delivery is not " +
      "available for that order.",
  },
  {
    id: "faq-delivery-area",
    category: "Delivery",
    question: "Where do you deliver?",
    // Source: terms.tsx §2 — India only; no international shipping. Careful not
    // to invent areas: availability is decided per address by the courier.
    answer:
      "Burgonomics delivers within India only — there is no international shipping. Deliveries are handled " +
      "by a delivery partner, so availability depends on whether a partner can serve your address; the app " +
      "tells you at checkout if delivery is not available for it.",
  },
  {
    id: "faq-track-order",
    category: "Orders",
    question: "How do I track my order?",
    // Source: orders.$orderId.track.tsx — live map + status steps, with an
    // honest "showing the last known status" state when updates pause.
    answer:
      "Open the order from Orders and tap to track it. You will see the live delivery status and map as it " +
      "updates. If live updates are interrupted, the screen says it is showing the last known status rather " +
      "than pretending it is current.",
  },
  {
    id: "faq-cancel",
    category: "Orders",
    question: "Can I cancel my order?",
    // Source: the Refund & Cancellation Policy, which restates the rule the
    // server actually enforces (functions/src/modules/orders/customerCancel.ts):
    // cancellable while PREPARING or earlier, and before a rider is assigned.
    answer:
      "Yes — free of charge while your order is being prepared or earlier, and before a rider is assigned. " +
      "Once a rider is assigned, or the order is ready, picked up or out for delivery, the app cannot " +
      "cancel it; call the store from the order screen or raise a support ticket and the store will help.",
  },
  {
    id: "faq-refund",
    category: "Payments",
    question: "When will I get a refund?",
    // Source: terms.tsx §3 — states 5-7 business days via Razorpay. Restated
    // exactly; nothing more specific is promised.
    answer:
      "If an order fails to deliver or arrives damaged or incorrect, a full or partial refund is processed to " +
      "your original payment method within 5–7 business days through Razorpay, as set out in our Terms.",
  },
  {
    id: "faq-payment-methods",
    category: "Payments",
    question: "How are online payments handled?",
    // Source: privacy.tsx — payments handled directly by Razorpay; the app does
    // not store card or bank credentials.
    answer:
      "Online payments are handled directly by Razorpay. Burgonomics does not store your card details, UPI " +
      "credentials, or bank account credentials.",
  },
  {
    id: "faq-raise-ticket",
    category: "Support",
    question: "How do I report a problem with an order?",
    // Source: this screen — CreateTicketForm posts to POST /tickets/create and
    // the ticket list below shows status; photos can be attached.
    answer:
      "Tap Raise support ticket on this page, pick the issue, and describe what happened. You can attach " +
      "photos of the order, and you can link the order it relates to. Your ticket then appears under Your " +
      "Active & Past Tickets on this page so you can follow its status.",
  },
  {
    id: "faq-photos",
    category: "Support",
    question: "Can I attach photos to a ticket?",
    // Source: CreateTicketForm — up to 3 images, 5 MB each.
    answer:
      "Yes. When raising a ticket you can attach up to 3 photos of the issue, at up to 5 MB each. Photos " +
      "help the store see exactly what went wrong.",
  },
  {
    id: "faq-delete-account",
    category: "Account",
    question: "How do I delete my account?",
    // Source: privacy.tsx Account Deletion section.
    answer:
      "You can request deletion from Profile → Settings → Delete Account, or by emailing our Data Protection " +
      "Officer. Deletion is immediate, except where the law requires us to keep records — GST invoices are " +
      "retained for 8 years and then anonymised.",
  },
  {
    id: "faq-veg",
    category: "Food",
    question: "Is everything vegetarian?",
    // Source: terms.tsx §2b and APP.vegPromise.
    answer:
      "Yes. All items are strictly vegetarian, prepared in FSSAI-licensed kitchens with no cross-contamination.",
  },
];
