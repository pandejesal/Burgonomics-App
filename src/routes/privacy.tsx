import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentView } from "@/features/legal";
import { PRIVACY_POLICY } from "@/features/legal/content/legalContent";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Burgonomics" },
      {
        name: "description",
        content:
          "Burgonomics Privacy Policy and data protection notice under the DPDP Act, 2023 and the IT Rules, 2021.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return <LegalDocumentView document={PRIVACY_POLICY} />;
}
