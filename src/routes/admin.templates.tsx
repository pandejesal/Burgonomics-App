import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminTemplatesPage } from "@/admin/pages/AdminTemplatesPage";

export const Route = createFileRoute("/admin/templates")({
  component: () => <AdminTemplatesPage />,
});
