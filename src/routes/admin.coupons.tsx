import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminCouponsPage } from "@/admin/pages/AdminCouponsPage";

export const Route = createFileRoute("/admin/coupons")({
  component: () => <AdminCouponsPage />,
});
