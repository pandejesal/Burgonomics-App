import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/shared/layouts/AppShell";
import { EmptyState } from "@/shared/components/feedback/EmptyState";

// Placeholder — Terms of use for Burgonomics.
export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & conditions — Burgonomics" },
      { name: "description", content: "Terms of use for Burgonomics." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <AppShell title="Terms & conditions" backTo="/profile" showTabs={true} showTopBar={true}>
      <EmptyState
        title="Terms & conditions"
        description="This screen is scaffolded. Feature logic ships in a future prompt: Latest revision loaded from CMS."
      />
    </AppShell>
  );
}
