import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminAutomationPage } from "@/admin/pages/AdminAutomationPage";

export const Route = createFileRoute("/admin/automation")({
  component: () => <AdminAutomationPage />,
});
