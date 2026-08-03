import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminOrdersPage } from "@/admin/pages/AdminOrdersPage";

export const Route = createFileRoute("/admin/orders")({
  component: () => <AdminOrdersPage />,
});
