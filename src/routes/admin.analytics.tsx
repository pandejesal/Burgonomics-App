import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminAnalyticsPage } from "@/admin/pages/AdminAnalyticsPage";

export const Route = createFileRoute("/admin/analytics")({
  component: () => <AdminAnalyticsPage />,
});
