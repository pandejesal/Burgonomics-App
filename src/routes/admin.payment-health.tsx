import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminPaymentHealthPage } from "@/admin/pages/AdminPaymentHealthPage";

export const Route = createFileRoute("/admin/payment-health")({
  component: () => <AdminPaymentHealthPage />,
});
