import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminSettingsPage } from "@/admin/pages/AdminSettingsPage";

export const Route = createFileRoute("/admin/settings")({
  component: () => <AdminSettingsPage />,
});
