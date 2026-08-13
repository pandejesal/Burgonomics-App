import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/shared/layouts/AppShell";
import { AppCard } from "@/shared/components/common/AppCard";
import { Text } from "@/shared/components/common/Text";
import { Shield, Lock, Eye, Trash2, Mail, FileText } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Burgonomics" },
      {
        name: "description",
        content: "Burgonomics Privacy Policy and Data Protection Notice under DPDP Act.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <AppShell title="Privacy Policy" backTo="/profile" showTabs={true} showTopBar={true}>
      <div className="mx-auto max-w-[680px] space-y-6 px-4 py-6">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Shield className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <Text variant="headlineMedium" as="h1" className="font-bold">
              Privacy Policy
            </Text>
            <Text variant="caption" tone="secondary">
              Effective Date: August 14, 2026 · Compliant with Digital Personal Data Protection (DPDP) Act
            </Text>
          </div>
        </div>

        <AppCard padded className="space-y-4">
          <section className="space-y-2">
            <Text variant="titleMedium" className="font-bold flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" /> 1. Information We Collect
            </Text>
            <Text variant="bodySmall" tone="secondary" className="leading-relaxed">
              When you use Burgonomics for food ordering, delivery, and dine-in services, we collect:
            </Text>
            <ul className="list-disc pl-5 space-y-1 text-sm text-text-secondary">
              <li><strong>Contact Information:</strong> Mobile phone number (for OTP login and order status SMS).</li>
              <li><strong>Profile Information:</strong> Name, delivery address, and dietary preferences you provide.</li>
              <li><strong>Order & Transaction Data:</strong> Items ordered, customization notes, order timestamps, and payment reference tokens.</li>
              <li><strong>Device & Usage Data:</strong> Device platform, IP address, and push notification tokens.</li>
            </ul>
          </section>

          <section className="space-y-2 pt-3 border-t border-divider">
            <Text variant="titleMedium" className="font-bold flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" /> 2. How We Use Your Data
            </Text>
            <Text variant="bodySmall" tone="secondary" className="leading-relaxed">
              Your personal data is used solely for legitimate business purposes:
            </Text>
            <ul className="list-disc pl-5 space-y-1 text-sm text-text-secondary">
              <li>Processing and delivering your food orders accurately.</li>
              <li>Transmitting Kitchen Order Tickets (KOT) to store POS terminals.</li>
              <li>Processing payments securely through RBI-authorized payment gateways (Razorpay).</li>
              <li>Sending transactional alerts (order placed, cooking, out for delivery).</li>
            </ul>
          </section>

          <section className="space-y-2 pt-3 border-t border-divider">
            <Text variant="titleMedium" className="font-bold flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> 3. Payment & Card Security
            </Text>
            <Text variant="bodySmall" tone="secondary" className="leading-relaxed">
              Burgonomics does <strong>not</strong> store your credit/debit card numbers, UPI PINs, or bank account credentials. All online payments are handled directly by Razorpay in compliance with PCI-DSS standards and RBI guidelines.
            </Text>
          </section>

          <section className="space-y-2 pt-3 border-t border-divider">
            <Text variant="titleMedium" className="font-bold flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-primary" /> 4. Your Rights & Account Deletion
            </Text>
            <Text variant="bodySmall" tone="secondary" className="leading-relaxed">
              Under the DPDP Act, you have the right to access your data, request correction of inaccuracies, and request complete erasure of your account and personal records. You can request deletion directly from <strong>Profile → Settings → Delete Account</strong> or by emailing our Data Protection Officer.
            </Text>
          </section>

          <section className="space-y-2 pt-3 border-t border-divider">
            <Text variant="titleMedium" className="font-bold flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" /> 5. Grievance Redressal
            </Text>
            <Text variant="bodySmall" tone="secondary" className="leading-relaxed">
              For any privacy inquiries or grievances, please contact:
              <br />
              <strong>Grievance Officer:</strong> Burgonomics Data Governance Team
              <br />
              <strong>Email:</strong> privacy@burgonomics.com
              <br />
              <strong>Address:</strong> Glassdoors Studio, Ahmedabad, Gujarat, India.
            </Text>
          </section>
        </AppCard>
      </div>
    </AppShell>
  );
}
