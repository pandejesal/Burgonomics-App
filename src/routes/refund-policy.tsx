import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentView } from "@/features/legal";
import { REFUND_POLICY } from "@/features/legal/content/legalContent";

export const Route = createFileRoute("/refund-policy")({
  head: () => ({
    meta: [
      { title: "Refund & Cancellation Policy — Burgonomics" },
      {
        name: "description",
        content:
          "When a Burgonomics order can be cancelled, what happens after a rider is assigned, and how refunds are paid.",
      },
    ],
  }),
  component: RefundPolicyPage,
});

function RefundPolicyPage() {
  return <LegalDocumentView document={REFUND_POLICY} />;
}
