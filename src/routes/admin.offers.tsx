import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminOffersPage } from "@/admin/pages/AdminOffersPage";

export const Route = createFileRoute("/admin/offers")({
  component: () => <AdminOffersPage />,
});
