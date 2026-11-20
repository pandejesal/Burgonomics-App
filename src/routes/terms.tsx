import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentView } from "@/features/legal";
import { TERMS_OF_USE } from "@/features/legal/content/legalContent";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use — Burgonomics" },
      {
        name: "description",
        content:
          "Terms of Use, pricing, payment, cancellation and the statutory seller disclosure for Burgonomics orders.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return <LegalDocumentView document={TERMS_OF_USE} />;
}
