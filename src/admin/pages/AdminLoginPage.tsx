import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ShieldAlert,
  Mail,
  Lock,
  CheckCircle2,
  QrCode,
  KeyRound,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";
import { useAdminAuthStore } from "../store/adminAuthStore";
import { adminAuthService } from "../services/adminAuthService";

interface AdminLoginPageProps {
  onSuccess: () => void;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({ onSuccess }) => {
  const { login, verify2Fa, isLoading, error, challenge, clearChallenge, clearError } =
    useAdminAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");

  // Developer force password change state
  const [isChangingDevPassword, setIsChangingDevPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdChangeSuccess, setPwdChangeSuccess] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    try {
      const challengeResponse = await login(email, password);
      // If no 2FA is required and no force change, skip straight to OTP verification or token issuance
      if (!challengeResponse.requires2Fa && !challengeResponse.requiresPasswordChange) {
        // Issue token pair right away by verifying with an empty or simulated code, or let verify2Fa handle it
        await verify2Fa("");
        onSuccess();
      } else if (challengeResponse.requiresPasswordChange) {
        setIsChangingDevPassword(true);
      }
    } catch (err: any) {
      console.error("Password stage failed:", err);
    }
  };

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    try {
      await verify2Fa(totpCode);
      onSuccess();
    } catch (err: any) {
      console.error("2FA verification failed:", err);
    }
  };

  const handleForcePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (newPassword.length < 8) {
      setLocalError("New password must be at least 8 characters long");
      return;
    }

    if (newPassword !== confirmPassword) {
      setLocalError("Passwords do not match");
      return;
    }

    if (!challenge?.challengeToken) {
      setLocalError("Session expired. Please log in again.");
      return;
    }

    try {
      const result = await adminAuthService.forceDeveloperPassword(
        challenge.challengeToken,
        password, // old password is what they typed first
        newPassword,
      );

      if (result.success) {
        setPwdChangeSuccess(true);
        // Clear challenge and return to login with new password
        setTimeout(() => {
          setIsChangingDevPassword(false);
          setPwdChangeSuccess(false);
          clearChallenge();
          setPassword("");
          setNewPassword("");
          setConfirmPassword("");
        }, 3000);
      }
    } catch (err: any) {
      setLocalError(err.message || "Failed to update developer password");
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
          {/* STEP 1: Email & Password */}
          {!challenge && !isChangingDevPassword && (
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
          )}

          {/* STEP 2A: TOTP Verification */}
          {challenge && challenge.requires2Fa && !isChangingDevPassword && (
            <motion.form
              key="totp-form"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              onSubmit={handleTotpSubmit}
              className="space-y-5"
            >
              <div className="rounded-2xl bg-[#0E4825]/5 border border-[#0E4825]/10 p-5 text-center">
                <QrCode className="mx-auto text-[#0E4825]" size={36} />
                <h3 className="mt-2 text-sm font-bold">2-Factor Authentication</h3>
                <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                  Enter the 6-digit TOTP verification code from your authenticator application
                  (Google, Microsoft, Authy, etc).
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                  6-Digit Verification Code
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  className="w-full text-center tracking-[12px] font-mono text-2xl rounded-2xl border border-gray-200 bg-gray-50 py-3.5 outline-none transition-all focus:border-[#0E4825] focus:bg-white focus:ring-1 focus:ring-[#0E4825]"
                  placeholder="000000"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-2xl bg-red-50 p-4 text-xs font-semibold text-red-600 border border-red-100">
                  <ShieldAlert size={16} />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={clearChallenge}
                  className="flex-1 rounded-2xl border border-gray-200 py-4 text-sm font-bold hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading || totpCode.length !== 6}
                  className="flex-[2] rounded-2xl bg-[#0E4825] py-4 text-sm font-bold text-white transition-all hover:bg-[#0B3A1D] disabled:bg-gray-200 disabled:text-gray-400"
                >
                  {isLoading ? "Verifying..." : "Verify & Enter"}
                </button>
              </div>
            </motion.form>
          )}

          {/* STEP 2B: Force Developer Password Change */}
          {isChangingDevPassword && (
            <motion.form
              key="pwd-change-form"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              onSubmit={handleForcePasswordChange}
              className="space-y-5"
            >
              <div className="rounded-2xl bg-[#FF6600]/5 border border-[#FF6600]/10 p-5 text-center">
                <KeyRound className="mx-auto text-[#FF6600]" size={32} />
                <h3 className="mt-2 text-sm font-bold text-[#FF6600]">
                  First Login Password Change Required
                </h3>
                <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                  As the Lead Architect/Developer, you are required to change your default seeded
                  credentials immediately on your very first login.
                </p>
              </div>

              {pwdChangeSuccess ? (
                <div className="rounded-2xl bg-[#0E4825]/5 border border-[#0E4825]/10 p-5 text-center text-sm font-semibold text-[#0E4825] flex flex-col items-center gap-2">
                  <CheckCircle2 size={28} />
                  <span>Password changed successfully! Returning you to sign-in...</span>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                      New Security Password
                    </label>
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3.5 px-4 text-sm font-medium outline-none transition-all focus:border-[#0E4825] focus:bg-white"
                      placeholder="••••••••••••"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                      Confirm Security Password
                    </label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3.5 px-4 text-sm font-medium outline-none transition-all focus:border-[#0E4825] focus:bg-white"
                      placeholder="••••••••••••"
                    />
                  </div>

                  {(localError || error) && (
                    <div className="flex items-center gap-2 rounded-2xl bg-red-50 p-4 text-xs font-semibold text-red-600 border border-red-100">
                      <AlertTriangle size={16} />
                      <span>{localError || error}</span>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsChangingDevPassword(false);
                        clearChallenge();
                      }}
                      className="flex-1 rounded-2xl border border-gray-200 py-4 text-sm font-bold hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!newPassword || !confirmPassword}
                      className="flex-[2] rounded-2xl bg-[#FF6600] py-4 text-sm font-bold text-white transition-all hover:bg-[#D95700]"
                    >
                      Update Password & Sign In
                    </button>
                  </div>
                </>
              )}
            </motion.form>
          )}
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
