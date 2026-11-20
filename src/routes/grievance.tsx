import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentView } from "@/features/legal";
import { GRIEVANCE_POLICY } from "@/features/legal/content/legalContent";

export const Route = createFileRoute("/grievance")({
  head: () => ({
    meta: [
      { title: "Grievance Redressal — Burgonomics" },
      {
        name: "description",
        content:
          "How to raise an order, payment or data complaint with the Burgonomics Grievance Officer, and the timelines that apply.",
      },
    ],
  }),
  component: GrievancePage,
});

function GrievancePage() {
  return <LegalDocumentView document={GRIEVANCE_POLICY} />;
}
