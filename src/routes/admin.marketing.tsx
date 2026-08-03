import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminMarketingDashboard } from "@/admin/pages/AdminMarketingDashboard";

export const Route = createFileRoute("/admin/marketing")({
  component: () => <AdminMarketingDashboard />,
});
