import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminOrdersPage } from "@/admin/pages/AdminOrdersPage";

function OrderDetailRouteComponent() {
  const { orderId } = Route.useParams();
  return <AdminOrdersPage defaultOrderId={orderId} />;
}

export const Route = createFileRoute("/admin/orders/$orderId")({
  component: OrderDetailRouteComponent,
});
