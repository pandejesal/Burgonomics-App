import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useEffect } from "react";
import { AdminLoginPage } from "@/admin/pages/AdminLoginPage";
import { useAdminAuthStore } from "@/admin/store/adminAuthStore";

export const Route = createFileRoute("/admin/login")({
  component: AdminLoginRouteComponent,
});

function AdminLoginRouteComponent() {
  const navigate = useNavigate();
  const { accessToken, bootstrap } = useAdminAuthStore();

  useEffect(() => {
    // Bootstrap session on mount
    void bootstrap().then((loggedIn) => {
      if (loggedIn) {
        void navigate({ to: "/admin" });
      }
    });
  }, [bootstrap, navigate]);

  return <AdminLoginPage onSuccess={() => navigate({ to: "/admin" })} />;
}
