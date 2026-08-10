import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ShieldAlert, Mail, Lock, ArrowLeft } from "lucide-react";
import { useAdminAuthStore } from "../store/adminAuthStore";

interface AdminLoginPageProps {
  onSuccess: () => void;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({ onSuccess }) => {
  const { login, isLoading, error } = useAdminAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      onSuccess();
    } catch (err: any) {
      console.error("Login failed:", err);
    }
  };

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-[#F8F8F8] px-6 py-12 font-sans text-[#1A1A1A]">
      <div className="relative w-full max-w-[480px] overflow-hidden rounded-[24px] border border-[#EAEAEA] bg-white p-10 shadow-[0_12px_40px_rgba(0,0,0,0.03)]">
        {/* Brand Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0E4825] text-white font-bold text-2xl shadow-[0_8px_20px_rgba(14,72,37,0.15)]">
            B
          </div>
          <h2 className="mt-4 text-2xl font-black tracking-tight text-[#0E4825]">BURGONOMICS</h2>
          <p className="text-xs font-bold uppercase tracking-widest text-[#FF6600] mt-1">
            ADMINISTRATIVE GATEWAY
          </p>
        </div>

        <AnimatePresence mode="wait">
          <motion.form
            key="login-form"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            onSubmit={handlePasswordSubmit}
            className="space-y-5"
          >
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                Admin Email
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3.5 pl-12 pr-4 text-sm font-medium outline-none transition-all focus:border-[#0E4825] focus:bg-white focus:ring-1 focus:ring-[#0E4825]"
                  placeholder="name@burgonomics.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3.5 pl-12 pr-4 text-sm font-medium outline-none transition-all focus:border-[#0E4825] focus:bg-white focus:ring-1 focus:ring-[#0E4825]"
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-2xl bg-red-50 p-4 text-xs font-semibold text-red-600 border border-red-100">
                <ShieldAlert size={16} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-2xl bg-[#0E4825] py-4 text-sm font-bold text-white transition-all hover:bg-[#0B3A1D] hover:shadow-[0_8px_24px_rgba(14,72,37,0.2)] disabled:bg-gray-200 disabled:text-gray-400 shadow-sm"
            >
              {isLoading ? "Verifying Credentials..." : "Authenticate Credentials"}
            </button>
          </motion.form>
        </AnimatePresence>

        <div className="mt-8 border-t border-gray-100 pt-6 text-center">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400 transition-colors hover:text-[#0E4825]"
          >
            <ArrowLeft size={14} />
            <span>Return to Main Website</span>
          </a>
        </div>
      </div>
    </div>
  );
};
