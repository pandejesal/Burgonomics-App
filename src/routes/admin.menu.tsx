import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminMenuPage } from "@/admin/pages/AdminMenuPage";

export const Route = createFileRoute("/admin/menu")({
  component: () => <AdminMenuPage />,
});
