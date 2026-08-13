import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ShoppingBag,
  Store,
  RefreshCw,
  Sliders,
  Users,
  CreditCard,
  Gift,
  Bell,
  BarChart3,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  User,
  Activity,
  KeyRound,
  Terminal,
  Settings,
  Sun,
  Moon,
  Laptop,
  Megaphone,
  Layers,
} from "lucide-react";
import { useAdminAuthStore } from "../store/adminAuthStore";
import { useAdminTheme } from "../theme/ThemeContext";
import { CommandPalette } from "../components/CommandPalette";
import { AdminAvatar } from "../components/Utilities";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const { admin, logout } = useAdminAuthStore();
  const { theme, setTheme } = useAdminTheme();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  const permissions = admin?.role?.permissions || [];
  const roleName = admin?.role?.name || "Administrator";

  const menuItems = [
    {
      label: "Dashboard",
      icon: LayoutDashboard,
      to: "/admin",
      perm: "admin.dashboard.view",
    },
    {
      label: "App Orders",
      icon: ShoppingBag,
      to: "/admin/orders",
      perm: "admin.orders.view",
    },
    {
      label: "Petpooja POS Bridge",
      icon: RefreshCw,
      to: "/admin/petpooja",
      perm: "admin.petpooja.sync",
    },
    {
      label: "Outlets & Stores",
      icon: Store,
      to: "/admin/stores",
      perm: "admin.stores.view",
    },
    {
      label: "Catalog & Menu",
      icon: Layers,
      to: "/admin/menu",
      perm: "admin.menu.sync",
    },
    {
      label: "Offers & Banners",
      icon: Gift,
      to: "/admin/offers",
      perm: "admin.coupons.manage",
    },
    {
      label: "Customers",
      icon: Users,
      to: "/admin/customers",
      perm: "admin.customer.view",
    },
    {
      label: "Store Settings",
      icon: Settings,
      to: "/admin/settings",
      perm: "admin.settings.manage",
    },
  ];

  // Filter menu items by permissions
  const filteredMenuItems = menuItems.filter(
    (item) =>
      !item.perm || permissions.includes(item.perm) || permissions.includes("admin.developer"),
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F8F8F8] dark:bg-[#121212] font-sans antialiased text-[#1A1A1A] dark:text-gray-200 transition-colors duration-200">
      {/* Mobile Bottom Drawer & Backdrop */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setIsSidebarOpen(false)}
            />

            {/* Bottom Sheet Drawer */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 210 }}
              className="fixed inset-x-0 bottom-0 z-[1001] flex max-h-[85vh] flex-col rounded-t-[32px] border-t border-[#EAEAEA] dark:border-gray-800 bg-white dark:bg-[#1A1A1A] pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-12px_40px_rgba(0,0,0,0.15)] lg:hidden"
            >
              {/* Drag/Swipe Indicator Handle */}
              <div className="flex justify-center py-3 shrink-0">
                <div className="h-1.5 w-12 rounded-full bg-gray-200 dark:bg-gray-700" />
              </div>

              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-[#EAEAEA] dark:border-gray-800/60 px-6 pb-4 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0E4825] text-white font-bold text-lg shadow-sm">
                    B
                  </div>
                  <div>
                    <span className="block font-black tracking-tight text-[#0E4825] dark:text-emerald-400 text-sm font-mono">
                      BURGONOMICS
                    </span>
                    <span className="block text-[9px] font-black uppercase tracking-wider text-[#FF6600]">
                      Admin Navigation
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 dark:text-gray-400"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Profile Bar */}
              <div className="px-6 py-3 bg-gray-50/80 dark:bg-[#161616]/40 border-b border-[#EAEAEA] dark:border-gray-800/40 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3">
                  <AdminAvatar fullName={admin?.fullName} status="online" size="sm" />
                  <div>
                    <span className="block text-xs font-bold text-gray-900 dark:text-white">
                      {admin?.fullName}
                    </span>
                    <span className="block text-[10px] text-[#FF6600] font-black uppercase tracking-wider">
                      {roleName}
                    </span>
                  </div>
                </div>
                <Link
                  to="/admin/profile"
                  onClick={() => setIsSidebarOpen(false)}
                  className="text-xs font-bold text-[#0E4825] dark:text-emerald-400 hover:underline"
                >
                  Profile Settings
                </Link>
              </div>

              {/* 2-Column Grid of Navigation Items */}
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="grid grid-cols-2 gap-3">
                  {filteredMenuItems.map((item) => {
                    const Icon = item.icon;
                    const isItemActive =
                      item.to === "/admin"
                        ? location.pathname === "/admin" || location.pathname === "/admin/"
                        : location.pathname.startsWith(item.to);

                    return (
                      <Link
                        key={item.to}
                        to={item.to as any}
                        onClick={() => setIsSidebarOpen(false)}
                        className={`flex flex-col items-start gap-2.5 p-4 rounded-2xl border transition-all duration-150 ${
                          isItemActive
                            ? "bg-[#0E4825] text-white border-transparent shadow-[0_4px_12px_rgba(14,72,37,0.15)]"
                            : "bg-gray-50/50 dark:bg-gray-900/40 border-gray-100 dark:border-gray-800/50 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/60"
                        }`}
                      >
                        <Icon
                          size={18}
                          className={
                            isItemActive ? "text-white" : "text-[#0E4825] dark:text-emerald-400"
                          }
                        />
                        <span className="text-[11px] font-bold tracking-tight uppercase leading-tight">
                          {item.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* Theme & Logout Section */}
              <div className="border-t border-[#EAEAEA] dark:border-gray-800 p-5 bg-gray-50/50 dark:bg-[#161616]/20 shrink-0 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    System Appearance
                  </span>
                  <div className="flex items-center gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-900 w-40">
                    {(["light", "dark", "system"] as const).map((mode) => {
                      const isActive = theme === mode;
                      return (
                        <button
                          key={mode}
                          onClick={() => setTheme(mode)}
                          className={`flex-1 flex items-center justify-center py-1.5 rounded-lg text-xs font-bold transition-all ${
                            isActive
                              ? "bg-white dark:bg-[#1A1A1A] text-gray-900 dark:text-white shadow-sm"
                              : "text-gray-400 dark:text-gray-500 hover:text-gray-600"
                          }`}
                          title={`${mode} mode`}
                        >
                          {mode === "light" && <Sun size={12} />}
                          {mode === "dark" && <Moon size={12} />}
                          {mode === "system" && <Laptop size={12} />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setIsSidebarOpen(false);
                    logout();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200/50 dark:border-red-950/40 py-2.5 text-xs font-bold text-red-600 bg-white dark:bg-transparent dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/15 transition-all duration-150 shadow-sm cursor-pointer"
                >
                  <LogOut size={13} />
                  <span>Secure Logout</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Persistent Floating Drawer Trigger (Mobile Only) */}
      <AnimatePresence>
        {!isSidebarOpen && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            onClick={() => setIsSidebarOpen(true)}
            className="fixed bottom-6 right-6 z-[998] flex h-14 w-14 lg:hidden items-center justify-center rounded-full bg-[#0E4825] text-white shadow-[0_8px_30px_rgba(14,72,37,0.35)] hover:bg-[#0B3A1D] active:scale-95 transition-all border border-white/10 cursor-pointer"
            aria-label="Open Admin Menu"
          >
            <Menu size={22} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar Container */}
      <aside className="hidden lg:flex w-[280px] flex-col border-r border-[#EAEAEA] dark:border-gray-800 bg-white dark:bg-[#1A1A1A] shrink-0">
        {/* Brand Header */}
        <div className="flex h-[80px] items-center justify-between border-b border-[#EAEAEA] dark:border-gray-800 px-6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0E4825] text-white font-black text-xl shadow-[0_4px_16px_rgba(14,72,37,0.25)]">
              B
            </div>
            <div>
              <span className="block font-black tracking-tight text-[#0E4825] dark:text-emerald-400 text-lg font-mono">
                BURGONOMICS
              </span>
              <span className="block text-[10px] font-black uppercase tracking-wider text-[#FF6600]">
                Admin Panel
              </span>
            </div>
          </div>
        </div>

        {/* Sidebar Nav Items */}
        <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
          {filteredMenuItems.map((item) => {
            const Icon = item.icon;
            const isItemActive =
              item.to === "/admin"
                ? location.pathname === "/admin" || location.pathname === "/admin/"
                : location.pathname.startsWith(item.to);

            return (
              <Link
                key={item.to}
                to={item.to as any}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all duration-150 group ${
                  isItemActive
                    ? "bg-[#0E4825] text-white shadow-[0_4px_12px_rgba(14,72,37,0.15)] dark:bg-[#0E4825] dark:text-white"
                    : "text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Icon
                  size={16}
                  className={
                    isItemActive
                      ? "text-white"
                      : "text-gray-400 dark:text-gray-500 group-hover:text-[#0E4825] dark:group-hover:text-emerald-400"
                  }
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Theme Settings & User Panel */}
        <div className="border-t border-[#EAEAEA] dark:border-gray-800 p-5 bg-gray-50/50 dark:bg-[#161616]/20 shrink-0">
          {/* Theme switcher */}
          <div className="flex items-center justify-between gap-1 mb-4 p-1 rounded-xl bg-gray-100 dark:bg-gray-900">
            {(["light", "dark", "system"] as const).map((mode) => {
              const isActive = theme === mode;
              return (
                <button
                  key={mode}
                  onClick={() => setTheme(mode)}
                  className={`flex-1 flex items-center justify-center py-1.5 rounded-lg text-xs font-bold transition-all ${
                    isActive
                      ? "bg-white dark:bg-[#1A1A1A] text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-400 dark:text-gray-500 hover:text-gray-600"
                  }`}
                  title={`${mode} mode`}
                >
                  {mode === "light" && <Sun size={14} />}
                  {mode === "dark" && <Moon size={14} />}
                  {mode === "system" && <Laptop size={14} />}
                </button>
              );
            })}
          </div>

          <Link
            to="/admin/profile"
            className="flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-900/50 p-2 rounded-2xl transition-all"
          >
            <AdminAvatar fullName={admin?.fullName} status="online" size="sm" />
            <div className="flex-1 min-w-0">
              <span className="block text-xs font-bold truncate text-gray-900 dark:text-white">
                {admin?.fullName}
              </span>
              <span className="block text-[10px] text-[#FF6600] font-black uppercase tracking-wider">
                {roleName}
              </span>
            </div>
          </Link>

          <button
            onClick={logout}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200/50 dark:border-red-950/40 py-2.5 text-xs font-bold text-red-600 bg-white dark:bg-transparent dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/15 transition-all duration-150 shadow-sm cursor-pointer"
          >
            <LogOut size={13} />
            <span>Secure Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Workspace Header */}
        <header className="flex h-[80px] items-center justify-between border-b border-[#EAEAEA] dark:border-gray-800 bg-white dark:bg-[#1A1A1A] px-6 md:px-8 shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#EAEAEA] dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 lg:hidden"
            >
              <Menu size={18} />
            </button>
            <div className="hidden sm:block">
              <h1 className="text-base font-black tracking-tight text-gray-900 dark:text-white font-sans uppercase">
                Operations Core
              </h1>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Burgonomics Enterprise Control Room
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Command Palette */}
            <CommandPalette />

            {/* Auth Session Shield badge */}
            <div className="flex items-center gap-1.5 rounded-xl bg-[#0E4825]/5 dark:bg-[#0E4825]/10 px-3.5 py-2 text-xs font-bold text-[#0E4825] dark:text-emerald-400 border border-[#0E4825]/10 dark:border-emerald-900/30 shadow-sm">
              <ShieldCheck size={14} />
              <span className="hidden xs:inline">SECURE AUTH</span>
            </div>

            {/* Role indicator */}
            <div className="flex items-center gap-1.5 rounded-xl bg-[#FF6600]/5 dark:bg-[#FF6600]/10 px-3.5 py-2 text-xs font-bold text-[#FF6600] border border-[#FF6600]/10 dark:border-orange-950/20 shadow-sm">
              <KeyRound size={14} />
              <span className="hidden xs:inline">{roleName.toUpperCase()}</span>
            </div>
          </div>
        </header>

        {/* Workspace Content */}
        <main className="flex-1 overflow-y-auto bg-[#F8F8F8] dark:bg-[#121212] p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};
