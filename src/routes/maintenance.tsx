import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/shared/layouts/AppShell";
import { Text } from "@/shared/components/common/Text";
import { EmptyState } from "@/shared/components/feedback/EmptyState";

// Placeholder — We'll be back shortly.
export const Route = createFileRoute("/maintenance")({
  head: () => ({
    meta: [
      { title: "Under maintenance — Burgonomics" },
      { name: "description", content: "We'll be back shortly." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <AppShell showTabs={false} showTopBar={false}>
      <EmptyState
        title="We'll be back shortly"
        description="Burgonomics is undergoing scheduled maintenance. Please try again in a few minutes."
        actionLabel="Try again"
        onAction={() => window.location.reload()}
      />
      <Text variant="bodyMedium" tone="secondary" className="mt-2 text-center">
        Still stuck?{" "}
        <Link to="/support" className="font-bold text-primary hover:underline">
          Contact support
        </Link>
      </Text>
    </AppShell>
  );
}
