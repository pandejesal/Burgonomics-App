import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminCampaignsPage } from "@/admin/pages/AdminCampaignsPage";

export const Route = createFileRoute("/admin/campaigns")({
  component: () => <AdminCampaignsPage />,
});
