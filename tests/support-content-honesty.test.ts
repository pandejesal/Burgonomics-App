import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LOCAL_FAQS } from "../src/features/support/data/faqs";
import { LOCAL_CHANNELS } from "../src/features/support/data/channels";
import { LOCAL_ISSUE_CATEGORIES } from "../src/features/support/data/issueCategories";
import { APP } from "../src/core/constants/app";

/**
 * The Help screen is opened by every App Store reviewer, so its content must be
 * true. These tests are the guard against invented facts: every FAQ answer must
 * restate something the app actually says, and every contact detail must come
 * from real app config.
 *
 * The sources are the app's own pages/flows:
 *   terms.tsx    — pricing/GST, fee breakup, delivery fee, cancellation, refund
 *   privacy.tsx  — account deletion, retention, Razorpay handling
 *   orders track — live status
 *   support UI   — ticket creation, photo attach
 *   APP          — contact addresses, veg promise
 */

const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8");
const termsSrc = read("../src/routes/terms.tsx");
const privacySrc = read("../src/routes/privacy.tsx");

const byId = (id: string) => {
  const faq = LOCAL_FAQS.find((f) => f.id === id);
  if (!faq) throw new Error(`FAQ ${id} missing`);
  return faq;
};

describe("FAQ answers are grounded in the app's own statements", () => {
  it("GST/pricing answer matches what terms.tsx states", () => {
    // Source text must really say 5% and CGST/SGST and "never added on top".
    expect(termsSrc).toContain("GST at 5%");
    expect(termsSrc).toContain("never added on top");
    const a = byId("faq-pricing-gst").answer;
    expect(a).toContain("5%");
    expect(a).toContain("CGST 2.5%");
    expect(a).toContain("never added on top");
  });

  it("fee-breakup answer matches the checkout formula in terms.tsx", () => {
    expect(termsSrc).toContain("Item Total + Packaging + Delivery Fee = Total to Pay");
    expect(byId("faq-charges-breakup").answer).toContain(
      "Item Total + Packaging + Delivery Fee = Total to Pay",
    );
  });

  it("delivery-fee answer says it is a live courier quote, as terms states", () => {
    expect(termsSrc).toMatch(/delivery fee is a live price/);
    const a = byId("faq-delivery-fee").answer;
    expect(a).toMatch(/live price|live quote/i);
    expect(a).toMatch(/before you pay/i);
  });

  it("refund answer restates the 5-7 business day promise and nothing tighter", () => {
    // terms.tsx writes "within 5–7 business days via Razorpay"; match the
    // stable core so an en/em-dash difference cannot make this vacuous.
    expect(termsSrc).toMatch(/5.7 business\s+days/);
    const a = byId("faq-refund").answer;
    expect(a).toMatch(/5.7 business days/);
    expect(a).toContain("Razorpay");
  });

  it("cancellation answer restates the kitchen-confirmation rule", () => {
    expect(termsSrc).toMatch(/prior to kitchen confirmation/);
    const a = byId("faq-cancel").answer;
    expect(a).toMatch(/kitchen confirms/i);
    expect(a).toMatch(/cannot be accepted/i);
  });

  it("account-deletion answer matches privacy.tsx paths and retention", () => {
    expect(privacySrc).toMatch(/Profile . Settings . Delete Account/);
    expect(privacySrc).toContain("8 years");
    const a = byId("faq-delete-account").answer;
    expect(a).toContain("Profile → Settings → Delete Account");
    expect(a).toContain("8 years");
  });

  it("payment-handling answer matches privacy.tsx's Razorpay statement", () => {
    expect(privacySrc).toMatch(/handled directly by Razorpay/);
    const a = byId("faq-payment-methods").answer;
    expect(a).toContain("Razorpay");
    expect(a).toMatch(/does not store/i);
  });

  it("the photo-attach answer matches the client's real limits (3 files, 5 MB)", () => {
    const formSrc = read("../src/features/support/components/CreateTicketForm.tsx");
    expect(formSrc).toContain("5 * 1024 * 1024");
    const a = byId("faq-photos").answer;
    expect(a).toContain("3 photos");
    expect(a).toContain("5 MB");
  });

  it("the veg answer matches the terms' pure-veg disclosure", () => {
    expect(termsSrc).toContain("FSSAI-licensed");
    const a = byId("faq-veg").answer;
    expect(a).toMatch(/vegetarian/i);
    expect(APP.vegPromise).toBe("100% Pure Veg");
  });
});

describe("FAQs invent no unsupported facts", () => {
  it("contains no invented delivery timeline or promised minutes", () => {
    for (const f of LOCAL_FAQS) {
      // No "30 minutes" style delivery promise, and no numeric ETA.
      expect(f.answer, `${f.id} must not promise a delivery time`).not.toMatch(
        /\b\d+\s*(?:-|–|to)?\s*\d*\s*(?:minutes?|mins?|hours?)\b.*(?:deliver|arrive)/i,
      );
    }
  });

  it("contains no invented delivery areas or pin codes", () => {
    for (const f of LOCAL_FAQS) {
      expect(f.answer, `${f.id} must not invent areas`).not.toMatch(
        /\b(?:Ahmedabad|Gujarat|Satellite|380015)\b/,
      );
      expect(f.answer).not.toMatch(/\b\d{6}\b/); // pin code
    }
  });

  it("contains no invented price, discount or free-delivery offer", () => {
    for (const f of LOCAL_FAQS) {
      expect(f.answer).not.toMatch(/free delivery/i);
      expect(f.answer).not.toMatch(/₹\s?\d+/);
      expect(f.answer).not.toMatch(/\b\d+%\s*off\b/i);
    }
  });

  it("contains no phone number, WhatsApp or support hours", () => {
    for (const f of LOCAL_FAQS) {
      expect(f.answer).not.toMatch(/\+?\d[\d\s-]{8,}/); // phone-like
      expect(f.answer).not.toMatch(/whatsapp/i);
      expect(f.answer).not.toMatch(/\b(?:mon|tue|wed|thu|fri|sat|sun)\b.*\b\d{1,2}\s*(?:am|pm)/i);
    }
  });
});

describe("channels expose only real configured contact details", () => {
  it("uses APP.supportEmail / APP.grievanceEmail verbatim, never a new address", () => {
    const emailValues = LOCAL_CHANNELS.filter((c) => c.kind === "email").map((c) => c.value);
    expect(emailValues.length).toBeGreaterThan(0);
    for (const v of emailValues) {
      expect([APP.supportEmail, APP.grievanceEmail]).toContain(v);
    }
  });

  it("has no phone/WhatsApp/chat channel, because APP has no such value", () => {
    expect(LOCAL_CHANNELS.some((c) => c.kind === "call")).toBe(false);
    expect(LOCAL_CHANNELS.some((c) => c.kind === "whatsapp")).toBe(false);
    expect(LOCAL_CHANNELS.some((c) => c.kind === "chat")).toBe(false);
  });

  it("always offers in-app ticketing, which really works", () => {
    const ticket = LOCAL_CHANNELS.find((c) => c.id === "in-app-ticket");
    expect(ticket).toBeDefined();
    expect(ticket?.available).toBe(true);
    expect(ticket?.kind).toBe("form");
  });

  it("APP has no phone/WhatsApp/hours keys to invent from", () => {
    const keys = Object.keys(APP);
    expect(keys.some((k) => /phone|whatsapp|hours/i.test(k))).toBe(false);
  });
});

describe("categories come from the app's single vocabulary", () => {
  it("lists exactly the six TicketCategory codes", () => {
    expect(LOCAL_ISSUE_CATEGORIES.map((c) => c.id)).toEqual([
      "LATE_DELIVERY",
      "MISSING_ITEM",
      "FOOD_QUALITY",
      "WRONG_ORDER",
      "PAYMENT_ISSUE",
      "OTHER",
    ]);
  });

  it("agrees with the labels CreateTicketForm already renders", () => {
    const formSrc = read("../src/features/support/components/CreateTicketForm.tsx");
    for (const c of LOCAL_ISSUE_CATEGORIES) {
      // The code must exist in the form's own CATEGORIES table.
      expect(formSrc).toContain(`"${c.id}"`);
    }
  });
});
