import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/shared/layouts/AppShell";
import { EmptyState } from "@/shared/components/feedback/EmptyState";

// Placeholder — How we handle your data.
export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy policy — Burgonomics" },
      { name: "description", content: "How we handle your data." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <AppShell title="Privacy policy" backTo="/profile" showTabs={true} showTopBar={true}>
      <EmptyState
        title="Privacy policy"
        description="This screen is scaffolded. Feature logic ships in a future prompt: Latest revision loaded from CMS."
      />
    </AppShell>
  );
}
