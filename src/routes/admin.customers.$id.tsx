import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminCustomerProfilePage } from "@/admin/pages/AdminCustomerProfilePage";

export const Route = createFileRoute("/admin/customers/$id")({
  component: () => <AdminCustomerProfilePage />,
});
