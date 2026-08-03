import React, { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  ShoppingBag,
  Store,
  Users,
  Menu as MenuIcon,
  CreditCard,
  Bell,
  BarChart3,
  Settings,
  Terminal,
  User,
  LogOut,
  Moon,
  Sun,
  Shield,
} from "lucide-react";
import { useAdminTheme } from "../theme/ThemeContext";
import { useAdminAuthStore } from "../store/adminAuthStore";

export const CommandPalette: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const { theme, setTheme } = useAdminTheme();
  const { logout } = useAdminAuthStore();

  // Toggle open on CMD/CTRL + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const runCommand = (command: () => void) => {
    command();
    setIsOpen(false);
  };

  return (
    <>
      {/* Floating Helper Button indicator in header */}
      <button
        onClick={() => setIsOpen(true)}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 text-xs font-semibold text-gray-400 hover:border-gray-200 transition-colors"
      >
        <Search size={14} />
        <span>Search admin...</span>
        <kbd className="font-mono text-[9px] bg-white dark:bg-gray-900 px-1.5 py-0.5 rounded-md border border-gray-100 dark:border-gray-800 shadow-sm ml-2">
          ⌘K
        </kbd>
      </button>

      {/* Actual cmdk dialog */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-[10vh] md:pt-[15vh]">
            {/* Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
            />

            {/* CMD Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -10 }}
              transition={{ duration: 0.18 }}
              className="relative w-full max-w-xl overflow-hidden rounded-[24px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] shadow-2xl z-50 font-sans"
            >
              <Command label="Global Command Menu" className="flex flex-col">
                {/* Input box */}
                <div className="flex items-center gap-3 border-b border-gray-50 dark:border-gray-800/80 px-4 py-3.5">
                  <Search className="text-gray-400 shrink-0" size={18} />
                  <Command.Input
                    placeholder="Search orders, customers, settings, utilities..."
                    className="w-full bg-transparent text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 outline-none"
                  />
                  <span className="text-[10px] font-bold text-gray-400 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 px-1.5 py-0.5 rounded-md">
                    ESC
                  </span>
                </div>

                {/* Scroller lists */}
                <Command.List className="max-h-[350px] overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-gray-200">
                  <Command.Empty className="text-xs font-bold text-gray-400 p-6 text-center">
                    No results or commands matching that query.
                  </Command.Empty>

                  {/* Navigation Shortcuts */}
                  <Command.Group
                    heading="Navigation"
                    className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 py-1.5 block"
                  >
                    <Command.Item
                      onSelect={() => runCommand(() => navigate({ to: "/admin" }))}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer select-none aria-selected:bg-[#0E4825]/5 dark:aria-selected:bg-[#0E4825]/10 aria-selected:text-[#0E4825] dark:aria-selected:text-emerald-400"
                    >
                      <BarChart3 size={15} />
                      <span>Dashboard & Core Stats</span>
                    </Command.Item>

                    <Command.Item
                      onSelect={() => runCommand(() => navigate({ to: "/admin/orders" }))}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer select-none aria-selected:bg-[#0E4825]/5 dark:aria-selected:bg-[#0E4825]/10 aria-selected:text-[#0E4825] dark:aria-selected:text-emerald-400"
                    >
                      <ShoppingBag size={15} />
                      <span>Orders Management</span>
                    </Command.Item>

                    <Command.Item
                      onSelect={() => runCommand(() => navigate({ to: "/admin/stores" }))}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer select-none aria-selected:bg-[#0E4825]/5 dark:aria-selected:bg-[#0E4825]/10 aria-selected:text-[#0E4825] dark:aria-selected:text-emerald-400"
                    >
                      <Store size={15} />
                      <span>Store Franchises & Outlets</span>
                    </Command.Item>

                    <Command.Item
                      onSelect={() => runCommand(() => navigate({ to: "/admin/customers" }))}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer select-none aria-selected:bg-[#0E4825]/5 dark:aria-selected:bg-[#0E4825]/10 aria-selected:text-[#0E4825] dark:aria-selected:text-emerald-400"
                    >
                      <Users size={15} />
                      <span>Registered Customers</span>
                    </Command.Item>

                    <Command.Item
                      onSelect={() => runCommand(() => navigate({ to: "/admin/menu" }))}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer select-none aria-selected:bg-[#0E4825]/5 dark:aria-selected:bg-[#0E4825]/10 aria-selected:text-[#0E4825] dark:aria-selected:text-emerald-400"
                    >
                      <MenuIcon size={15} />
                      <span>Catalog Menu Sync & Prices</span>
                    </Command.Item>

                    <Command.Item
                      onSelect={() => runCommand(() => navigate({ to: "/admin/payments" }))}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer select-none aria-selected:bg-[#0E4825]/5 dark:aria-selected:bg-[#0E4825]/10 aria-selected:text-[#0E4825] dark:aria-selected:text-emerald-400"
                    >
                      <CreditCard size={15} />
                      <span>Razorpay & Payment Processing</span>
                    </Command.Item>

                    <Command.Item
                      onSelect={() => runCommand(() => navigate({ to: "/admin/developer" }))}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer select-none aria-selected:bg-[#0E4825]/5 dark:aria-selected:bg-[#0E4825]/10 aria-selected:text-[#0E4825] dark:aria-selected:text-emerald-400"
                    >
                      <Terminal size={15} />
                      <span>Developer Audit & Console Logs</span>
                    </Command.Item>
                  </Command.Group>

                  {/* Actions / Settings */}
                  <Command.Group
                    heading="Utility Commands"
                    className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 py-1.5 block border-t border-gray-50 dark:border-gray-800/20 mt-2"
                  >
                    <Command.Item
                      onSelect={() =>
                        runCommand(() => setTheme(theme === "dark" ? "light" : "dark"))
                      }
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer select-none aria-selected:bg-[#0E4825]/5 dark:aria-selected:bg-[#0E4825]/10 aria-selected:text-[#0E4825] dark:aria-selected:text-emerald-400"
                    >
                      {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
                      <span>Toggle Visual Theme ({theme === "dark" ? "Light" : "Dark"})</span>
                    </Command.Item>

                    <Command.Item
                      onSelect={() => runCommand(() => navigate({ to: "/admin/profile" }))}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer select-none aria-selected:bg-[#0E4825]/5 dark:aria-selected:bg-[#0E4825]/10 aria-selected:text-[#0E4825] dark:aria-selected:text-emerald-400"
                    >
                      <User size={15} />
                      <span>My Profile Security & 2FA</span>
                    </Command.Item>

                    <Command.Item
                      onSelect={() => runCommand(() => navigate({ to: "/admin/settings" }))}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer select-none aria-selected:bg-[#0E4825]/5 dark:aria-selected:bg-[#0E4825]/10 aria-selected:text-[#0E4825] dark:aria-selected:text-emerald-400"
                    >
                      <Settings size={15} />
                      <span>Global Store Settings</span>
                    </Command.Item>

                    <Command.Item
                      onSelect={() => runCommand(() => logout())}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/10 cursor-pointer select-none aria-selected:bg-red-50 dark:aria-selected:bg-red-950/20"
                    >
                      <LogOut size={15} />
                      <span>Securely Log Out</span>
                    </Command.Item>
                  </Command.Group>
                </Command.List>
              </Command>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
