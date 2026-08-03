import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminDeveloperPage } from "@/admin/pages/AdminDeveloperPage";

export const Route = createFileRoute("/admin/developer")({
  component: () => <AdminDeveloperPage />,
});
