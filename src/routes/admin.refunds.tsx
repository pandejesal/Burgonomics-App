import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminRefundsPage } from "@/admin/pages/AdminRefundsPage";

export const Route = createFileRoute("/admin/refunds")({
  component: () => <AdminRefundsPage />,
});
