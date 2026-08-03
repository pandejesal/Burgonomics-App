import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminDashboardPlaceholder } from "@/admin/pages/AdminDashboardPlaceholder";

export const Route = createFileRoute("/admin/")({
  component: AdminIndexRouteComponent,
});

function AdminIndexRouteComponent() {
  return <AdminDashboardPlaceholder />;
}
