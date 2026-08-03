import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminPaymentsPage } from "@/admin/pages/AdminPaymentsPage";

export const Route = createFileRoute("/admin/payments")({
  component: () => <AdminPaymentsPage />,
});
