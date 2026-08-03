import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/shared/layouts/AppShell";
import { EmptyState } from "@/shared/components/feedback/EmptyState";

// Placeholder — Please update to continue.
export const Route = createFileRoute("/force-update")({
  head: () => ({
    meta: [
      { title: "Update required — Burgonomics" },
      { name: "description", content: "Please update to continue." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <AppShell showTabs={false} showTopBar={false}>
      <EmptyState
        title="A new version is available"
        description="Please update Burgonomics to the latest version to continue ordering."
        actionLabel="Update now"
      />
    </AppShell>
  );
}
