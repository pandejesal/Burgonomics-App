import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminCustomersPage } from "@/admin/pages/AdminCustomersPage";

export const Route = createFileRoute("/admin/customers")({
  component: () => <AdminCustomersPage />,
});
