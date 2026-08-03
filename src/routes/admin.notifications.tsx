import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminNotificationsPage } from "@/admin/pages/AdminNotificationsPage";

export const Route = createFileRoute("/admin/notifications")({
  component: () => <AdminNotificationsPage />,
});
