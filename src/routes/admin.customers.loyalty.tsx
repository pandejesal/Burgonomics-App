import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminLoyaltyConfigPage } from "@/admin/pages/AdminLoyaltyConfigPage";

export const Route = createFileRoute("/admin/customers/loyalty")({
  component: () => <AdminLoyaltyConfigPage />,
});
