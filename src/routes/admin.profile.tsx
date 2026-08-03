import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminProfilePage } from "@/admin/pages/AdminProfilePage";

export const Route = createFileRoute("/admin/profile")({
  component: () => <AdminProfilePage />,
});
