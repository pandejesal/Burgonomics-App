import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminStoresPage } from "@/admin/pages/AdminStoresPage";

export const Route = createFileRoute("/admin/stores")({
  component: () => <AdminStoresPage />,
});
