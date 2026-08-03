import { createFileRoute, Outlet } from "@tanstack/react-router";
import * as React from "react";
import { PetpoojaOperationsLayout } from "@/admin/layouts/PetpoojaOperationsLayout";

export const Route = createFileRoute("/admin/petpooja")({
  component: () => (
    <PetpoojaOperationsLayout>
      <Outlet />
    </PetpoojaOperationsLayout>
  ),
});
