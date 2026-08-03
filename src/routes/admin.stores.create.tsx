import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminStoresPage } from "@/admin/pages/AdminStoresPage";

function StoreCreateRouteComponent() {
  return <AdminStoresPage isCreate={true} />;
}

export const Route = createFileRoute("/admin/stores/create")({
  component: StoreCreateRouteComponent,
});
