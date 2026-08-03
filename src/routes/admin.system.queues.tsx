import { createFileRoute } from "@tanstack/react-router";
import { AdminSystemPage } from "@/admin/pages/AdminSystemPage";

export const Route = createFileRoute("/admin/system/queues")({
  component: () => <AdminSystemPage activeView="queues" />,
});
