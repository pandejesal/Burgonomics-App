import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminPaymentDetailsPage } from "@/admin/pages/AdminPaymentDetailsPage";

export const Route = createFileRoute("/admin/payments/$id")({
  component: AdminPaymentDetailsPage,
});
