/**
 * Legal content — the single source for the four customer-facing legal
 * documents (privacy policy, terms of use, refund & cancellation policy,
 * grievance redressal).
 *
 * Two renderers read this module:
 *   1. the in-app routes (`src/routes/{privacy,terms,refund-policy,grievance}.tsx`
 *      through `features/legal/components/LegalDocumentView`), and
 *   2. the static HTML generator (`scripts/render-legal-html.ts`) that publishes
 *      stable public URLs on the Customer app's own hosting
 *      (`/legal/privacy`, `/legal/terms`, `/legal/refund-policy`,
 *      `/legal/grievance`).
 *
 * Editing this file updates both, so a store listing can never point at copy
 * that drifts from the app.
 *
 * FACTS come only from the app's own constants (`src/core/constants/app.ts`)
 * and from behaviour the code actually implements:
 *   - cancellation window: `functions/src/modules/orders/customerCancel.ts` —
 *     "being prepared or earlier" AND no rider assigned;
 *   - refund routing: a cancelled PAID order queues one refund row for human
 *     approval, then Razorpay returns the money to the original method
 *     (`functions/src/modules/orders/cancelRefundObligation.ts`);
 *   - payment lanes: Razorpay hosted checkout, cash on delivery, and cash at
 *     the counter for walk-in / takeaway orders.
 *
 * Two separate lists keep the documents honest:
 *   - `LEGAL_PLACEHOLDERS` — facts the app does NOT have. Each is a
 *     `[[PLACEHOLDER:…]]` token that renderers turn into a visibly marked
 *     "[TO BE SUPPLIED: …]" value, and the release checklist blocks on it.
 *   - `LEGAL_FACTS_TO_CONFIRM` — facts the app DOES print but nobody has
 *     verified against a document (the GSTIN, the registered address, the
 *     mailbox). The page prints them; the checklist still blocks until the
 *     owner confirms them.
 * Both lists are mirrored in `LEGAL-FACTS-NEEDED.md`.
 */
import { APP, isUnsetRegistrationValue, legalEntityProse } from "@/core/constants/app";

/** Effective date of these documents. */
export const LEGAL_EFFECTIVE_DATE = "20 November 2026";

/** Inline token syntax used inside the document text below. */
export const PLACEHOLDER_TOKEN = /\[\[PLACEHOLDER:([a-z0-9-]+)\]\]/g;

/** The visibly marked value a renderer prints in place of a token. */
export function placeholderMark(label: string): string {
  return `[TO BE SUPPLIED: ${label}]`;
}

export interface LegalPlaceholder {
  /** Token id used inside the document text. */
  id: string;
  /** Human label printed inside the marked value. */
  label: string;
  /** Who supplies the fact. */
  owner: string;
  /** Why the fact is needed. */
  why: string;
  /** Where a developer reads or writes it. */
  codeLocation: string;
  /** The concrete evidence that closes this item. */
  doneWhen: string;
}

/**
 * Facts the app needs and does not have. Keep this list and the tokens inside
 * the documents in step — a test fails on an unknown token, and on a listed
 * fact that no document uses.
 */
export const LEGAL_PLACEHOLDERS: LegalPlaceholder[] = [
  {
    id: "fssai-per-outlet",
    label: "FSSAI licence number for each outlet",
    owner: "Owner / Burgonomics team",
    why: "Indian food law requires the licence of the kitchen that prepares the food to be displayed. There is one number per outlet, and the app already promises a per-store number on the menu and at checkout.",
    codeLocation:
      "src/core/constants/app.ts — fssaiLicense holds the masked 1072XXXXXXXXXX value, which the current terms page suppresses",
    doneWhen:
      "Every live outlet's real 14-digit FSSAI licence number is recorded (per outlet), printed on that outlet's menu/checkout legal surface, and the masked constant is gone.",
  },
  {
    id: "grievance-officer-name",
    label: "Grievance Officer — full name",
    owner: "Owner",
    why: "DPDP Act 2023 and IT Rules 2021 require a named individual, not a job title, to own a complaint.",
    codeLocation: "src/core/constants/app.ts — no officer name constant exists yet",
    doneWhen:
      "A named individual is appointed in writing and their full name renders on the grievance page instead of a mark.",
  },
  {
    id: "grievance-officer-phone",
    label: "Grievance Officer — phone number",
    owner: "Owner",
    why: "The grievance route needs a phone contact beside the mailbox, so a complaint cannot be blocked by a dead inbox.",
    codeLocation: "src/core/constants/app.ts — no officer phone constant exists yet",
    doneWhen:
      "A monitored phone number that reaches the named officer renders on the grievance page, and a test call from outside the organisation connects.",
  },
  {
    id: "cin",
    label: "CIN, or a written confirmation that none applies",
    owner: "Owner",
    why: "The GST certificate names a partnership, so no CIN may apply — but that has never been confirmed in writing, and the field is currently empty.",
    codeLocation: "src/core/constants/app.ts — cin is an empty string",
    doneWhen:
      "Either the real CIN is in the constant and prints, or a written statement that the entity is a partnership with no CIN is on file and the page says exactly that.",
  },
];

export interface LegalConfirmation {
  id: string;
  label: string;
  /** The value the app prints today. */
  currentValue: string;
  owner: string;
  why: string;
  codeLocation: string;
  /** The concrete evidence that closes this item. */
  doneWhen: string;
}

/**
 * Facts the app DOES print but nobody has verified. These are not marked as
 * placeholders on the page (a value exists), yet the release checklist blocks
 * until the owner confirms each one against the underlying document.
 */
export const LEGAL_FACTS_TO_CONFIRM: LegalConfirmation[] = [
  {
    id: "registered-address-confirmation",
    label: "Registered address",
    currentValue: APP.registeredAddress,
    owner: "Owner",
    why: "The address printed comes from an app constant, while the handover notes still describe a different one (a studio name), so it must be confirmed against the registration certificate.",
    codeLocation: "src/core/constants/app.ts — registeredAddress",
    doneWhen:
      "The owner confirms in writing that this exact address appears on the GST registration certificate (or supplies the correct one, which then replaces the constant).",
  },
  {
    id: "gstin-confirmation",
    label: "GSTIN",
    currentValue: isUnsetRegistrationValue(APP.gstin) ? "(masked)" : APP.gstin,
    owner: "Owner",
    why: "This GSTIN prints on customer receipts and legal pages. The handover notes still describe the field as masked, so a wrong value would be a false tax disclosure on every invoice.",
    codeLocation: "src/core/constants/app.ts — gstin",
    doneWhen:
      "The owner confirms the exact 15-character GSTIN against the registration certificate, and a receipt printed from the app shows the same string.",
  },
  {
    id: "grievance-mailbox",
    label: "Grievance / privacy mailbox",
    currentValue: `${APP.grievanceEmail}, ${APP.nodalEmail}`,
    owner: "Owner / Burgonomics team",
    why: "A data-deletion or grievance request that quietly bounces is the exact failure the DPDP Act penalises. No evidence exists that any of these mailboxes is created.",
    codeLocation: "src/core/constants/app.ts — grievanceEmail, nodalEmail",
    doneWhen:
      "A test email sent from outside the organisation to both addresses is received and answered, and the fact is recorded with its date.",
  },
];

export type LegalBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "facts"; rows: Array<{ label: string; value: string }> }
  | { kind: "note"; text: string };

export interface LegalSection {
  id: string;
  heading: string;
  blocks: LegalBlock[];
}

export type LegalSlug = "privacy" | "terms" | "refund-policy" | "grievance";

export interface LegalDocument {
  id: string;
  /** Public slug — also the in-app route path and the `/legal/<slug>` URL. */
  slug: LegalSlug;
  title: string;
  /** One-paragraph summary shown under the title. */
  summary: string;
  sections: LegalSection[];
}

/** Identity facts the documents may print. */
export const LEGAL_IDENTITY = {
  entityProse: legalEntityProse,
  entityRegistered: APP.legalEntity,
  tradeName: APP.tradeName,
  address: APP.registeredAddress,
  supportEmail: APP.supportEmail,
  grievanceEmail: APP.grievanceEmail,
  nodalEmail: APP.nodalEmail,
  /** A masked constant is never printed as a fact — it becomes a marked value. */
  gstin: isUnsetRegistrationValue(APP.gstin)
    ? placeholderMark("GSTIN — confirm against the registration certificate")
    : APP.gstin,
  cin: isUnsetRegistrationValue(APP.cin) ? "[[PLACEHOLDER:cin]]" : APP.cin,
  fssai: isUnsetRegistrationValue(APP.fssaiLicense)
    ? "[[PLACEHOLDER:fssai-per-outlet]]"
    : APP.fssaiLicense,
} as const;

const seller = `${legalEntityProse}, trading as ${APP.tradeName}, ${APP.registeredAddress}, India`;

export const PRIVACY_POLICY: LegalDocument = {
  id: "privacy-policy",
  slug: "privacy",
  title: "Privacy Policy",
  summary:
    "What personal data the Burgonomics customer app collects, why we hold it, who processes it, how long we keep it, and how to get it corrected or erased under the Digital Personal Data Protection Act, 2023.",
  sections: [
    {
      id: "fiduciary",
      heading: "Data fiduciary and consent",
      blocks: [
        {
          kind: "paragraph",
          text: `Data Fiduciary: ${seller}. We process your data only after your free, specific, informed and unambiguous consent (DPDP Act 2023, section 6). You may withdraw consent at any time; withdrawing it does not affect processing that was lawful before withdrawal.`,
        },
        {
          kind: "facts",
          rows: [
            {
              label: "Registered entity",
              value: `${APP.legalEntity}, trading as ${APP.tradeName}`,
            },
            { label: "CIN", value: LEGAL_IDENTITY.cin },
            { label: "GSTIN", value: LEGAL_IDENTITY.gstin },
            { label: "Grievance email", value: APP.grievanceEmail },
          ],
        },
      ],
    },
    {
      id: "collect",
      heading: "Information we collect",
      blocks: [
        {
          kind: "list",
          items: [
            "Contact information: your mobile number (used for OTP sign-in and order updates) and an optional email address you add to your profile.",
            "Profile information: your name, delivery addresses and any dietary preference you choose to record.",
            "Order and transaction data: items ordered, customisation notes, order timestamps, and the payment reference returned by the payment gateway. We never receive or store your card number, UPI PIN or bank credentials.",
            "Device and usage data: app platform, IP address, and the push-notification token used to deliver order updates when notifications are enabled.",
            "Support information: messages, order references and photos you choose to attach when raising a support ticket.",
            "Location, only when you allow it: used to show the nearest outlet and to give the delivery partner the drop-off point. You can type an address instead and the app still works.",
          ],
        },
      ],
    },
    {
      id: "use",
      heading: "How we use your data",
      blocks: [
        {
          kind: "list",
          items: [
            "To take, prepare and deliver your order, and to send the kitchen ticket to the outlet's point-of-sale system.",
            "To process payment through an RBI-authorised payment gateway (Razorpay), or to collect cash on delivery or at the counter.",
            "To send transactional order updates (order placed, preparing, out for delivery, delivered).",
            "To answer a support ticket or grievance you raise.",
            "To keep the accounting records the law requires (see retention below).",
          ],
        },
      ],
    },
    {
      id: "processors",
      heading: "Who processes your data",
      blocks: [
        {
          kind: "facts",
          rows: [
            {
              label: "Payments",
              value:
                "Razorpay — hosted checkout and refunds. Card and UPI credentials never reach Burgonomics.",
            },
            {
              label: "Sign-in, database, notifications",
              value: "Google Firebase, hosted in asia-south1 (Mumbai).",
            },
            {
              label: "Kitchen and point of sale",
              value: "Petpooja, at the outlet preparing your order.",
            },
            {
              label: "Delivery",
              value:
                "The courier that accepts the delivery for your order; it receives the drop-off address, the contact number for the hand-over and the order value.",
            },
          ],
        },
        {
          kind: "note",
          text: "The courier is named per order wherever the booking records one. We never name a courier brand that your order does not carry.",
        },
      ],
    },
    {
      id: "payments",
      heading: "Payment and card security",
      blocks: [
        {
          kind: "paragraph",
          text: "Online payments are handled directly by Razorpay in compliance with PCI-DSS and RBI requirements. Burgonomics does not store your credit or debit card numbers, UPI PIN or bank account credentials. Cash on delivery and counter cash involve no online payment data at all.",
        },
      ],
    },
    {
      id: "rights",
      heading: "Your rights, correction, nomination and deletion",
      blocks: [
        {
          kind: "paragraph",
          text: "Under the DPDP Act you may access your data, correct it from Profile → Edit Profile, nominate another person to exercise your rights in the event of death or incapacity, and request erasure. You can delete your account from Profile → Settings → Delete Account, or by writing to our Data Protection Officer. Deletion is immediate except where the law requires retention — GST invoices are kept for 8 years and then anonymised.",
        },
      ],
    },
    {
      id: "retention",
      heading: "Retention and storage location",
      blocks: [
        {
          kind: "list",
          items: [
            "Order invoices: 8 years (GST law), then anonymised.",
            "Profile and saved addresses: until you erase them or delete your account.",
            "One-time-password logs: 180 days, without the code itself.",
            "Support tickets: 3 years.",
            "Storage: Google Firebase in asia-south1 (Mumbai), India. No international transfer.",
          ],
        },
      ],
    },
    {
      id: "grievance",
      heading: "Grievance redressal and nodal contact (IT Rules, 2021)",
      blocks: [
        {
          kind: "facts",
          rows: [
            { label: "Grievance Officer", value: "[[PLACEHOLDER:grievance-officer-name]]" },
            {
              label: "Grievance Officer phone",
              value: "[[PLACEHOLDER:grievance-officer-phone]]",
            },
            { label: "Grievance email", value: APP.grievanceEmail },
            { label: "Address", value: APP.registeredAddress },
            { label: "Nodal contact (law-enforcement coordination)", value: APP.nodalEmail },
            { label: "Data Protection Officer", value: "Same contact as the Grievance Officer" },
            {
              label: "Service level",
              value:
                "Acknowledgement within 24 hours; resolution within 15 days (IT Rules 2021, rule 3(2)).",
            },
          ],
        },
      ],
    },
  ],
};

export const TERMS_OF_USE: LegalDocument = {
  id: "terms-of-use",
  slug: "terms",
  title: "Terms of Use",
  summary:
    "The contract between you and Burgonomics when you order through the customer app: acceptance, pricing, payment, cancellation, refunds and the statutory seller disclosure.",
  sections: [
    {
      id: "acceptance",
      heading: "Ordering and acceptance",
      blocks: [
        {
          kind: "paragraph",
          text: "Placing an order through the Burgonomics app is an offer to buy the items at the prices shown. The contract forms when the outlet accepts the order and raises its kitchen ticket. Until then the order may be refused — for example when an item has sold out, or when no courier can serve your address — and the app tells you.",
        },
      ],
    },
    {
      id: "pricing",
      heading: "Pricing, taxes and delivery",
      blocks: [
        {
          kind: "paragraph",
          text: "All prices are in Indian Rupees and already include GST at 5% (CGST 2.5% + SGST 2.5%). GST is shown on your bill for information and is never added on top. Checkout shows the full breakup: item total, less any coupon discount, plus packaging and any delivery fee, plus an optional rider tip if you add one — that is the amount you pay. The packaging charge is set by the outlet. The delivery fee is a live price from our delivery partner for your address and order, shown before you pay. If no delivery partner can serve your address, delivery is not available for that order. We deliver within India only.",
        },
      ],
    },
    {
      id: "payment",
      heading: "Payment methods",
      blocks: [
        {
          kind: "list",
          items: [
            "Online: card, UPI, netbanking or wallet through the Razorpay checkout the app opens.",
            "Cash on delivery: pay the rider in cash when the order arrives.",
            "Cash at the counter: walk-in and takeaway orders paid at the outlet counter, including orders staff place for a walk-in customer.",
          ],
        },
        {
          kind: "paragraph",
          text: "A cash order is confirmed when the outlet accepts it, not when cash changes hands. An online order does not reach the kitchen until the payment gateway confirms the payment.",
        },
      ],
    },
    {
      id: "cancellation",
      heading: "Cancellation and refunds",
      blocks: [
        {
          kind: "paragraph",
          text: "You may cancel free of charge from the app while your order is being prepared or earlier, and before a rider has been assigned. That is the window in which neither the kitchen nor a courier has committed to your order. Once a rider is assigned, or the order is ready, picked up or out for delivery, the app cannot cancel it — call the outlet from the order screen or raise a support ticket, and the store decides what can still be done. The full rules, refund routes and timelines are in the Refund & Cancellation Policy, which forms part of these terms.",
        },
        {
          kind: "note",
          text: "The cancellation action is server-side: it re-checks ownership and the window before writing anything, so a second tap or a second device cannot double-cancel.",
        },
      ],
    },
    {
      id: "seller",
      heading: "Seller disclosure (Consumer Protection E-Commerce Rules, 2020)",
      blocks: [
        {
          kind: "facts",
          rows: [
            { label: "Seller", value: `${legalEntityProse}, trading as ${APP.tradeName}` },
            { label: "Registered address", value: APP.registeredAddress },
            { label: "CIN", value: LEGAL_IDENTITY.cin },
            { label: "GSTIN", value: LEGAL_IDENTITY.gstin },
            { label: "FSSAI licence", value: LEGAL_IDENTITY.fssai },
            {
              label: "Helpline",
              value: `${APP.supportEmail}, or the in-app Help & Support channel`,
            },
            {
              label: "Food promise",
              value: "100% vegetarian items, prepared in FSSAI-licensed kitchens.",
            },
          ],
        },
      ],
    },
    {
      id: "support",
      heading: "Support and governing law",
      blocks: [
        {
          kind: "paragraph",
          text: `Questions about an order or these terms: ${APP.supportEmail}, or the in-app Help & Support channel. These terms are governed by the laws of India; disputes are subject to the jurisdiction of the courts at Ahmedabad, Gujarat.`,
        },
      ],
    },
  ],
};

export const REFUND_POLICY: LegalDocument = {
  id: "refund-policy",
  slug: "refund-policy",
  title: "Refund & Cancellation Policy",
  summary:
    "When you can cancel, what happens once a rider is assigned, and how money comes back for online, cash-on-delivery and counter-cash orders.",
  sections: [
    {
      id: "cancel-window",
      heading: "When you can cancel in the app",
      blocks: [
        {
          kind: "paragraph",
          text: "You may cancel from the app while your order is being prepared or earlier — in other words, before a rider has been assigned to it. That covers the time before the kitchen commits food and before a courier commits a rider; normally the first few minutes after you order.",
        },
        {
          kind: "list",
          items: [
            "No fee is charged for a cancellation inside that window.",
            "Once a rider is assigned, or the order is ready, picked up or out for delivery, the app refuses the cancellation and says so. Call the outlet from the order screen or raise a support ticket; the store decides what can still be done.",
            "A cancelled order is cancelled on the server, not only on your phone, so the kitchen and the courier see the same state.",
          ],
        },
        {
          kind: "note",
          text: "The app also shows a short free-cancellation countdown right after you order. That countdown is a convenience display; the rule that decides a cancellation is the one above, checked on the server at the moment you tap.",
        },
      ],
    },
    {
      id: "refund-online",
      heading: "Refunds for online payments",
      blocks: [
        {
          kind: "paragraph",
          text: "When a paid order is cancelled, a refund request is raised against the captured payment and returned to the original payment method through Razorpay. A refund is released after the store reviews the request — a deliberate human check, not an automatic payout — and once released it usually reaches your account within 5–7 business days, depending on your bank.",
        },
        {
          kind: "list",
          items: [
            "Partial refunds are possible where only part of the order is affected.",
            "If a payment is captured but the order cannot be created, or is cancelled before payment confirmation, the amount is returned in full.",
            "A refund cannot be redirected to a different card, UPI ID or bank account; it always returns to the method that paid.",
          ],
        },
      ],
    },
    {
      id: "refund-cash",
      heading: "Cash on delivery and counter cash",
      blocks: [
        {
          kind: "paragraph",
          text: "A cash-on-delivery order cancelled before dispatch has taken no money, so there is nothing to refund. If cash was already collected and the order cannot be delivered, the outlet refunds the cash directly — the rider or the store hands it back and the order record notes it.",
        },
        {
          kind: "paragraph",
          text: "Counter cash, for walk-in and takeaway orders paid at the outlet, is refunded at the counter by the outlet. The app records the payment but cannot move counter cash back to you.",
        },
      ],
    },
    {
      id: "missing-wrong",
      heading: "Missing, wrong or spoiled items",
      blocks: [
        {
          kind: "paragraph",
          text: "If an order arrives damaged, incomplete or incorrect, raise a support ticket from the order screen and attach photos where you can. The store reviews the ticket, and a full or partial refund follows the route above depending on how the order was paid.",
        },
      ],
    },
    {
      id: "contacts",
      heading: "Who to contact",
      blocks: [
        {
          kind: "facts",
          rows: [
            {
              label: "Order help",
              value: "Order screen → Report Issue, or Help & Support in the app",
            },
            { label: "Email", value: APP.supportEmail },
            {
              label: "Grievance",
              value: `${APP.grievanceEmail} — see the Grievance Redressal page`,
            },
          ],
        },
      ],
    },
  ],
};

export const GRIEVANCE_POLICY: LegalDocument = {
  id: "grievance",
  slug: "grievance",
  title: "Grievance Redressal",
  summary:
    "How to complain about an order, a payment or your personal data, who owns the complaint, and the timelines that apply under the IT Rules 2021 and the DPDP Act 2023.",
  sections: [
    {
      id: "officer",
      heading: "Grievance Officer",
      blocks: [
        {
          kind: "paragraph",
          text: "Every complaint about the Burgonomics app is owned by one named person, not a mailbox. The details below are the statutory contact for the IT Rules 2021 and the DPDP Act 2023.",
        },
        {
          kind: "facts",
          rows: [
            { label: "Grievance Officer", value: "[[PLACEHOLDER:grievance-officer-name]]" },
            { label: "Phone", value: "[[PLACEHOLDER:grievance-officer-phone]]" },
            { label: "Email", value: APP.grievanceEmail },
            { label: "Address", value: APP.registeredAddress },
            { label: "Data Protection Officer", value: "Same contact as the Grievance Officer" },
            { label: "Nodal contact (law-enforcement coordination)", value: APP.nodalEmail },
          ],
        },
      ],
    },
    {
      id: "how",
      heading: "How to raise a complaint",
      blocks: [
        {
          kind: "list",
          items: [
            "Fastest for an order problem: the order screen's Report Issue button or Help & Support, which links the complaint to that order and its payment.",
            "For a payment or refund: keep the order number and the payment reference on the receipt, and say which method you paid with.",
            "For personal data — access, correction, nomination or erasure: write to the Grievance Officer, or use Profile → Settings → Delete Account for full erasure.",
            "You may also write to the Grievance Officer by post at the address above.",
          ],
        },
      ],
    },
    {
      id: "timelines",
      heading: "What happens next",
      blocks: [
        {
          kind: "facts",
          rows: [
            { label: "Acknowledgement", value: "Within 24 hours of receipt." },
            { label: "Resolution", value: "Within 15 days (IT Rules 2021, rule 3(2))." },
            {
              label: "If unresolved",
              value:
                "You may escalate in writing to the Nodal Contact Person above; the complaint and its history move with it.",
            },
            {
              label: "Data erasure",
              value:
                "Immediate, except records the law requires us to keep (GST invoices, 8 years, then anonymised).",
            },
          ],
        },
      ],
    },
    {
      id: "scope",
      heading: "What this covers",
      blocks: [
        {
          kind: "paragraph",
          text: "Late, missing or wrong orders; food quality; payment and refund failures; app access problems; and any question about how your personal data is handled. A complaint about a specific outlet is still owned here — the officer routes it to the outlet and keeps the timeline.",
        },
      ],
    },
  ],
};

/** All four documents, in the order the profile lists them. */
export const LEGAL_DOCUMENTS: LegalDocument[] = [
  PRIVACY_POLICY,
  TERMS_OF_USE,
  REFUND_POLICY,
  GRIEVANCE_POLICY,
];

export const LEGAL_DOCUMENTS_BY_SLUG: Record<LegalSlug, LegalDocument> = {
  privacy: PRIVACY_POLICY,
  terms: TERMS_OF_USE,
  "refund-policy": REFUND_POLICY,
  grievance: GRIEVANCE_POLICY,
};

/** Public URL path for a document on the Customer app's own hosting. */
export function legalPublicPath(slug: LegalSlug): string {
  return `/legal/${slug}`;
}

/** In-app route path for a document. */
export function legalRoutePath(slug: LegalSlug): string {
  return `/${slug}`;
}
