import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LEGAL_DOCUMENTS,
  LEGAL_DOCUMENTS_BY_SLUG,
  LEGAL_FACTS_TO_CONFIRM,
  LEGAL_PLACEHOLDERS,
  PLACEHOLDER_TOKEN,
  legalPublicPath,
  legalRoutePath,
  placeholderMark,
} from "../src/features/legal/content/legalContent";
import { renderedText, renderLegalDocument } from "../src/features/legal/renderLegal";
import { renderLegalFactsMarkdown } from "../src/features/legal/factsMarkdown";
import { PLACEHOLDER_LABELS } from "../src/features/legal/placeholders";

/**
 * LEGAL PAGES — the four documents a store reviewer opens, plus the stable
 * public URLs generated for the store listing.
 *
 * The rules pinned here:
 *   1. the four documents exist, in the app and at a public path;
 *   2. every placeholder token has a declared fact, and every declared fact
 *      is used — so the published LEGAL-FACTS-NEEDED list cannot drift;
 *   3. a missing statutory fact is visibly MARKED, never a plausible-looking
 *      number or a bare role title (that was the original defect: the Grievance
 *      Officer rendered as "Manager — Legal" and the FSSAI line vanished);
 *   4. the cancellation rule matches the server that actually decides it
 *      (preparing or earlier, and no rider assigned);
 *   5. the published HTML carries the same text as the app, has no BOM, and
 *      does not resurrect the old entity names.
 */

const read = (relativePath: string) => readFileSync(resolve(__dirname, relativePath), "utf8");

describe("1. four documents, one per legal surface", () => {
  it("declares privacy, terms, refund/cancellation and grievance", () => {
    expect(LEGAL_DOCUMENTS.map((document) => document.slug)).toEqual([
      "privacy",
      "terms",
      "refund-policy",
      "grievance",
    ]);
  });

  it("maps each slug to a document and a stable path pair", () => {
    for (const slug of ["privacy", "terms", "refund-policy", "grievance"] as const) {
      expect(LEGAL_DOCUMENTS_BY_SLUG[slug].slug).toBe(slug);
      expect(legalRoutePath(slug)).toBe(`/${slug}`);
      expect(legalPublicPath(slug)).toBe(`/legal/${slug}`);
    }
  });

  it("every document has at least three sections of real copy", () => {
    for (const document of LEGAL_DOCUMENTS) {
      expect(document.sections.length, `${document.slug} sections`).toBeGreaterThanOrEqual(3);
      expect(document.summary.trim().length).toBeGreaterThan(40);
    }
  });
});

describe("2. placeholders are declared, used, and visibly marked", () => {
  const rendered = LEGAL_DOCUMENTS.map((document) =>
    renderLegalDocument(document, PLACEHOLDER_LABELS),
  );
  const used = new Set(rendered.flatMap((document) => document.placeholderIds));

  it("every token in the copy maps to a declared placeholder fact", () => {
    const declaredIds = LEGAL_PLACEHOLDERS.map((placeholder) => placeholder.id);
    for (const id of used) expect(declaredIds, `undeclared token ${id}`).toContain(id);
  });

  it("every declared placeholder fact is used by at least one document", () => {
    // A fact nobody prints is dead weight in LEGAL-FACTS-NEEDED.md and lets the
    // list look complete while a page still has an unmarked gap.
    const unused = LEGAL_PLACEHOLDERS.map((placeholder) => placeholder.id).filter(
      (id) => !used.has(id),
    );
    expect(unused, "declared but unused placeholder ids").toEqual([]);
  });

  it("renders every gap as a marked value, never as invented copy", () => {
    for (const document of rendered) {
      const text = renderedText(document);
      // Any token left in text means a label map missed an id.
      expect(text, `${document.slug} unresolved token`).not.toMatch(PLACEHOLDER_TOKEN);
      for (const mark of text.match(/\[TO BE SUPPLIED: [^\]]*\]/g) ?? []) {
        expect(mark).not.toBe("[TO BE SUPPLIED: ]");
      }
    }
  });

  it("the privacy and grievance pages require the officer's NAME and PHONE", () => {
    // The original defect: a job title rendered as the officer. A named person
    // and a dial-able number are the DPDP/IT-Rules minimum.
    const privacy = renderedText(rendered[0]);
    const grievance = renderedText(rendered[3]);
    for (const text of [privacy, grievance]) {
      expect(text).toContain(placeholderMark(PLACEHOLDER_LABELS["grievance-officer-name"]));
      expect(text).toContain(placeholderMark(PLACEHOLDER_LABELS["grievance-officer-phone"]));
      expect(text).not.toContain("Manager — Legal");
      expect(text).not.toContain("Manager - Legal");
    }
  });

  it("never prints a masked (X-filled) registration id as if it were real", () => {
    for (const document of rendered) {
      const text = renderedText(document);
      expect(text).not.toMatch(/1072X{4,}/);
      expect(text).not.toMatch(/24X{4,}/);
    }
  });

  it("names the four facts the owner must confirm even though a value prints", () => {
    expect(LEGAL_FACTS_TO_CONFIRM.map((fact) => fact.id)).toEqual([
      "registered-address-confirmation",
      "gstin-confirmation",
      "grievance-mailbox",
    ]);
  });
});

describe("3. the refund/cancellation rule matches the server", () => {
  const refund = renderedText(
    renderLegalDocument(LEGAL_DOCUMENTS_BY_SLUG["refund-policy"], PLACEHOLDER_LABELS),
  );

  it("says a customer may cancel until a rider is assigned", () => {
    expect(refund).toMatch(/before a rider has been assigned/i);
    expect(refund).toMatch(/refuses the cancellation/i);
  });

  it("states the human refund-approval step and the Razorpay route", () => {
    expect(refund).toMatch(/Razorpay/);
    expect(refund).toMatch(/5–7 business days|5-7 business days/);
    expect(refund).toMatch(/human check/);
  });

  it("covers all three launch payment lanes", () => {
    expect(refund).toMatch(/Cash on delivery/);
    expect(refund).toMatch(/Counter cash/);
    expect(refund).toMatch(/original payment method/);
  });

  it("matches the server's own rider-assigned refusal rule in words", () => {
    // functions/src/modules/orders/customerCancel.ts refuses once
    // `deliveryStatus` is dispatched / rider_assigned / in_transit, or rider
    // identity exists, and past PREPARING. The copy must not promise more.
    expect(refund).toMatch(/being prepared or earlier/i);
    expect(refund).not.toMatch(/any time before delivery/i);
    expect(refund).not.toMatch(/cancel any time/i);
  });
});

describe("3b. the bill the terms promise is the bill the cart computes", () => {
  const terms = renderedText(
    renderLegalDocument(LEGAL_DOCUMENTS_BY_SLUG.terms, PLACEHOLDER_LABELS),
  );

  it("names the coupon and rider-tip lines the checkout actually applies", () => {
    // src/features/cart/components/BillBreakdown.tsx computes
    // subtotal - coupon - coins + packaging + delivery + tip. The terms must not
    // describe a flat "Item + Packaging + Delivery" sum, which would omit two
    // lines a customer can see.
    expect(terms).toMatch(/coupon discount/i);
    expect(terms).toMatch(/rider tip/i);
    expect(terms).not.toMatch(/Item Total \+ Packaging \+ Delivery Fee/i);
  });

  it("never promises a tax that is added on top of the item total", () => {
    expect(terms).toMatch(/never added on top/i);
    expect(terms).toMatch(/GST at 5%/);
  });
});

describe("4. the public HTML is generated and matches the app", () => {
  const privacyHtml = read("../public/legal/privacy/index.html");
  const refundHtml = read("../public/legal/refund-policy/index.html");
  const grievanceHtml = read("../public/legal/grievance/index.html");
  const indexPath = read("../public/legal/index.html");

  it("ships a page for every document plus an index", () => {
    for (const path of [
      "../public/legal/privacy/index.html",
      "../public/legal/terms/index.html",
      "../public/legal/refund-policy/index.html",
      "../public/legal/grievance/index.html",
      "../public/legal/index.html",
    ]) {
      expect(readFileSync(resolve(__dirname, path)).length).toBeGreaterThan(1000);
    }
    expect(indexPath).toContain("Refund &amp; Cancellation Policy");
  });

  it("has no BOM and no double-encoded text", () => {
    for (const path of ["../public/legal/privacy/index.html", "../public/legal/terms/index.html"]) {
      const bytes = readFileSync(resolve(__dirname, path));
      expect(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, `${path} BOM`).toBe(
        false,
      );
      expect(bytes.toString("utf8")).not.toMatch(/Ã.|â€|Â/);
    }
  });

  it("carries the same missing-fact marks the app renders", () => {
    expect(privacyHtml).toContain("[TO BE SUPPLIED:");
    expect(privacyHtml).toContain("Grievance Officer");
    expect(grievanceHtml).toContain("Within 15 days");
    expect(refundHtml).toContain("before a rider has been assigned");
  });

  it("warns a reviewer that the page is not publishable while a fact is missing", () => {
    expect(privacyHtml).toContain("not publishable yet");
    expect(refundHtml).not.toContain("not publishable yet");
  });

  it("never names the previous entities or a studio", () => {
    for (const html of [privacyHtml, refundHtml, grievanceHtml, indexPath]) {
      expect(html).not.toContain("Burgonomics Pvt Ltd");
      expect(html).not.toContain("Glassdoors");
      expect(html).not.toContain("Foodworks");
    }
  });

  it("runs no inline script, so the hosting CSP does not block the page", () => {
    // Both hosting targets send `script-src 'self'` with no 'unsafe-inline'.
    // A legal page must render as static text — an inline script here would be
    // silently blocked and, worse, would mean the copy is computed at runtime.
    for (const path of [
      "../public/legal/privacy/index.html",
      "../public/legal/terms/index.html",
      "../public/legal/refund-policy/index.html",
      "../public/legal/grievance/index.html",
      "../public/legal/index.html",
    ]) {
      expect(read(path).match(/<script\b/g), `${path} must contain no script tag`).toBeNull();
    }
  });

  it("cross-links the four documents from every page", () => {
    for (const path of [
      "../public/legal/privacy/index.html",
      "../public/legal/terms/index.html",
      "../public/legal/refund-policy/index.html",
      "../public/legal/grievance/index.html",
    ]) {
      const html = read(path);
      const others = LEGAL_DOCUMENTS.filter((document) => path.includes(document.slug) === false);
      for (const other of others) {
        expect(html, `${path} must link ${legalPublicPath(other.slug)}`).toContain(
          legalPublicPath(other.slug),
        );
      }
      expect(html).toContain('href="/legal/"');
    }
  });
});

describe("5. the app links every document, from sign-in and from the profile", () => {
  it("the sign-in screen links the terms and the privacy policy", () => {
    const login = read("../src/features/auth/components/PhoneLoginForm.tsx");
    expect(login).toContain('to="/terms"');
    expect(login).toContain('to="/privacy"');
  });

  it("the profile lists all four documents", () => {
    const profile = read("../src/routes/profile.index.tsx");
    for (const route of ["/privacy", "/terms", "/refund-policy", "/grievance"]) {
      expect(profile, `profile must link ${route}`).toMatch(new RegExp(`to:\\s*"${route}"`));
    }
  });

  it("every document route renders through the shared legal view", () => {
    for (const slug of ["privacy", "terms", "refund-policy", "grievance"]) {
      const route = read(`../src/routes/${slug}.tsx`);
      expect(route).toContain("LegalDocumentView");
    }
  });
});

describe("6. LEGAL-FACTS-NEEDED.md is generated from the same module", () => {
  it("is byte-identical to the generator output (regenerate with npm run legal:facts)", () => {
    // A hand-kept list drifts; a stale list is how a statutory gap ships.
    const committed = read("../LEGAL-FACTS-NEEDED.md");
    expect(committed, "LEGAL-FACTS-NEEDED.md is stale").toBe(renderLegalFactsMarkdown());
  });

  it("lists every missing fact with an owner, a reason and a done-when", () => {
    const markdown = renderLegalFactsMarkdown();
    for (const placeholder of LEGAL_PLACEHOLDERS) {
      expect(markdown, `missing ${placeholder.id}`).toContain(placeholder.label);
      expect(markdown).toContain(placeholder.codeLocation);
      expect(markdown).toContain(placeholder.doneWhen);
    }
    expect(markdown).toContain(`**Status today: ${LEGAL_PLACEHOLDERS.length} facts missing`);
    expect(markdown).toContain(`${LEGAL_FACTS_TO_CONFIRM.length} facts unverified.**`);
  });

  it("blocks the release in words the non-developer owner can act on", () => {
    const markdown = renderLegalFactsMarkdown();
    expect(markdown).toContain("Do **not** submit either app");
    expect(markdown).toContain("STORE_SUBMISSION_CHECKLIST.md");
    expect(markdown).toContain("npm run legal:facts -- --check");
  });
});
