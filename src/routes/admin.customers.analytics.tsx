import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminCustomerAnalyticsPage } from "@/admin/pages/AdminCustomerAnalyticsPage";

export const Route = createFileRoute("/admin/customers/analytics")({
  component: () => <AdminCustomerAnalyticsPage />,
});
