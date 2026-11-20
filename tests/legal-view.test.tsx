/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

// The shell pulls in the offline banner (react-query), the bottom tab bar and
// the router; this test is about the document body, so the shell is reduced to a
// plain wrapper. Mocking by the resolved source path (not the `@/` alias) means
// the mock is keyed to the exact module file the component imports.
vi.mock("../src/shared/layouts/AppShell", () => ({
  AppShell: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", { "data-test": "shell" }, children),
}));

import { LegalDocumentView } from "../src/features/legal/components/LegalDocumentView";
import { LEGAL_DOCUMENTS_BY_SLUG } from "../src/features/legal/content/legalContent";

/**
 * The four legal pages are the screens a store reviewer opens. A page that
 * silently renders an omitted statutory fact (the old terms page dropped the
 * FSSAI line and printed "Manager — Legal" as the Grievance Officer) is the
 * defect this whole feature exists to stop. These tests mount the real component
 * and read the DOM.
 */

async function mount(element: React.ReactElement) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  return { host, root };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the in-app legal page renders the shared document", () => {
  it("renders the privacy policy with a marked gap and a publishability banner", async () => {
    const { host, root } = await mount(
      <LegalDocumentView document={LEGAL_DOCUMENTS_BY_SLUG.privacy} />,
    );

    const text = host.textContent ?? "";
    expect(text).toContain("Privacy Policy");
    expect(text).toContain("Data fiduciary and consent");
    // The gaps are visible, not silently dropped.
    expect(text).toContain("[TO BE SUPPLIED: Grievance Officer — full name]");
    expect(text).toContain("[TO BE SUPPLIED: Grievance Officer — phone number]");
    expect(host.querySelector('[data-testid="legal-placeholder-banner"]')).not.toBeNull();
    // The old defect: a job title standing in for a named person.
    expect(text).not.toContain("Manager — Legal");

    await act(async () => root.unmount());
  });

  it("renders the refund policy with no banner, because nothing is missing there", async () => {
    const { host, root } = await mount(
      <LegalDocumentView document={LEGAL_DOCUMENTS_BY_SLUG["refund-policy"]} />,
    );

    const text = host.textContent ?? "";
    expect(text).toContain("Refund & Cancellation Policy");
    expect(text).toContain("before a rider has been assigned");
    expect(text).toContain("5–7 business days");
    expect(text).not.toContain("[TO BE SUPPLIED:");
    expect(host.querySelector('[data-testid="legal-placeholder-banner"]')).toBeNull();

    await act(async () => root.unmount());
  });

  it("renders the grievance page with the officer fields marked", async () => {
    const { host, root } = await mount(
      <LegalDocumentView document={LEGAL_DOCUMENTS_BY_SLUG.grievance} />,
    );

    const text = host.textContent ?? "";
    expect(text).toContain("Grievance Redressal");
    expect(text).toContain("[TO BE SUPPLIED: Grievance Officer — full name]");
    expect(text).toContain("Within 15 days");
    expect(text).not.toContain("1072X");
    expect(text).not.toContain("24X");

    await act(async () => root.unmount());
  });

  it("renders the terms with the FSSAI licence marked rather than omitted", async () => {
    const { host, root } = await mount(
      <LegalDocumentView document={LEGAL_DOCUMENTS_BY_SLUG.terms} />,
    );

    const text = host.textContent ?? "";
    expect(text).toContain("FSSAI licence");
    expect(text).toContain("[TO BE SUPPLIED: FSSAI licence number for each outlet]");
    // All three launch payment lanes are named.
    expect(text).toContain("Cash on delivery");
    expect(text).toContain("Cash at the counter");

    await act(async () => root.unmount());
  });
});
