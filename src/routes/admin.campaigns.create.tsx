import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminCreateCampaignPage } from "@/admin/pages/AdminCreateCampaignPage";

export const Route = createFileRoute("/admin/campaigns/create")({
  component: () => <AdminCreateCampaignPage />,
});
