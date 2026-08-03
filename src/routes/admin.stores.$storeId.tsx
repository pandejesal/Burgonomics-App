import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { AdminStoresPage } from "@/admin/pages/AdminStoresPage";

function StoreDetailRouteComponent() {
  const { storeId } = Route.useParams();
  return <AdminStoresPage defaultStoreId={storeId} />;
}

export const Route = createFileRoute("/admin/stores/$storeId")({
  component: StoreDetailRouteComponent,
});
