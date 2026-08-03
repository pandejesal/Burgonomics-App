import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminReconciliationPage } from "@/admin/pages/AdminReconciliationPage";

export const Route = createFileRoute("/admin/reconciliation")({
  component: () => <AdminReconciliationPage />,
});
