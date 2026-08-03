import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminSegmentsPage } from "@/admin/pages/AdminSegmentsPage";

export const Route = createFileRoute("/admin/customers/segments")({
  component: () => <AdminSegmentsPage />,
});
