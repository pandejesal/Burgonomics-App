import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import * as React from "react";
import { useEffect, useState } from "react";
import { useAdminAuthStore } from "@/admin/store/adminAuthStore";
import { AdminLayout } from "@/admin/layouts/AdminLayout";
import { ThemeProvider } from "@/admin/theme/ThemeContext";

export const Route = createFileRoute("/admin")({
  component: AdminLayoutRouteComponent,
});

function AdminLayoutRouteComponent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { admin, bootstrap, isLoading } = useAdminAuthStore();
  const [isReady, setIsReady] = useState(false);

  const isLoginPage = location.pathname === "/admin/login";

  useEffect(() => {
    if (isLoginPage) {
      setIsReady(true);
      return;
    }

    // Attempt to bootstrap admin session using Firebase Auth state
    bootstrap().then((loggedIn) => {
      if (!loggedIn && !admin) {
        void navigate({ to: "/admin/login" });
      }
      setIsReady(true);
    });
  }, [bootstrap, navigate, isLoginPage]);

  if (isLoginPage) {
    return <Outlet />;
  }

  if (!isReady || isLoading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#F8F8F8] font-sans antialiased">
        <div className="relative flex flex-col items-center">
          {/* Pulsing loading lock */}
          <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-[#0E4825] text-white font-bold text-2xl shadow-lg">
            B
          </div>
          <span className="mt-4 text-xs font-bold uppercase tracking-widest text-[#FF6600] animate-pulse">
            Authenticating Administrative Access...
          </span>
        </div>
      </div>
    );
  }

  if (!admin) {
    return null;
  }

  return (
    <ThemeProvider>
      <AdminLayout>
        <Outlet />
      </AdminLayout>
    </ThemeProvider>
  );
}
