import * as React from "react";
import { createPortal } from "react-dom";
import { X, ShieldCheck, Sparkles, ArrowRight, Lock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useAuthStore } from "@/features/auth/state/authStore";
import { RecaptchaHost } from "@/features/auth/components/RecaptchaHost";
import { authService } from "@/features/auth/services/authService";
import { sanitizePhone, validateOtp, validatePhone } from "@/features/auth/utils/validators";
import { isAuthoredAuthMessage } from "@/features/auth/utils/authErrors";
import { HapticService } from "@/core/services/haptics";
import { toUserMessage } from "@/core/errors/userMessages";
import { useLoyaltyStore } from "@/features/loyalty/state/loyaltyStore";

interface QuickAuthSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ChallengeConflict {
  handle: string;
  maskedPhone: string;
  flow: string;
}

export function QuickAuthSheet({ isOpen, onClose, onSuccess }: QuickAuthSheetProps) {
  const [phone, setPhone] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [step, setStep] = React.useState<"phone" | "otp">("phone");
  const [busy, setBusy] = React.useState(false);
  const [maskedPhone, setMaskedPhone] = React.useState("");
  const [conflict, setConflict] = React.useState<ChallengeConflict | null>(null);

  const requestOtp = useAuthStore((s) => s.requestOtp);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const resetAuthAttempts = useAuthStore((s) => s.resetAuthAttempts);
  const status = useAuthStore((s) => s.status);
  const isBusy = busy || status === "authenticating" || status === "verifying";

  // Reopen is a resume, not a new request: the host remounts, then the
  // attempt layer restores the checkout-owned challenge without a network call.
  React.useEffect(() => {
    if (isOpen) {
      setOtp("");
      setBusy(false);
      setConflict(null);
      const resumed = authService.resumeChallenge("checkout");
      if (resumed) {
        setStep("otp");
        setMaskedPhone(resumed.maskedPhone);
      } else {
        setStep("phone");
        setMaskedPhone("");
      }
    }
  }, [isOpen]);

  // ESC to close
  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    // Canonical validators (same as the login screen): rejects overlong
    // input and non-[6-9]-series numbers instead of silently re-targeting
    // with slice(-10) — which burned real SMS on invalid numbers.
    const validation = validatePhone(phone);
    if (!validation.valid) {
      toast.error(validation.error ?? "Please enter a valid 10-digit mobile number");
      return;
    }

    setBusy(true);
    void HapticService.impact("medium");

    const res = await requestOtp("checkout", `+91${sanitizePhone(phone)}`, "sms");
    setBusy(false);

    if (res.ok) {
      const active = useAuthStore.getState().challenge;
      setMaskedPhone(active?.maskedPhone ?? "");
      setConflict(null);
      setStep("otp");
      toast.success("OTP sent to your number!");
    } else {
      if (res.code === "CHALLENGE_ACTIVE_OTHER_FLOW" && res.details?.handle) {
        setConflict({
          handle: res.details.handle,
          maskedPhone: res.details.maskedPhone ?? "",
          flow: res.details.flow ?? "another screen",
        });
      }
      // Code only: provider messages may contain the phone number.
      console.error("[auth] checkout OTP request failed:", res.code);
      toast.error(
        res.error && isAuthoredAuthMessage(res.error) ? res.error : toUserMessage(res),
      );
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const otpCheck = validateOtp(otp);
    if (!otpCheck.valid) {
      toast.error(otpCheck.error ?? "Please enter the complete verification code");
      return;
    }

    setBusy(true);
    void HapticService.impact("medium");

    const active = useAuthStore.getState().challenge;
    if (!active?.handle) {
      setBusy(false);
      setStep("phone");
      toast.error("Request a new verification code to continue.");
      return;
    }
    const res = await verifyOtp("checkout", active.handle, otp);
    setBusy(false);

    if (res.ok) {
      // Loop 65/120: no local signup mint. The server ledger is the sole minter.
      try {
        const uid = useAuthStore.getState().user?.id ?? null;
        void useLoyaltyStore.getState().refreshFromServer(uid);
      } catch {
        // balance refresh is best-effort here; checkout re-syncs anyway
      }
      toast.success("Verified successfully!");
      onSuccess();
      onClose();
    } else {
      // Code only; auth copy is already authored.
      console.error("[auth] checkout OTP verify failed:", res.code);
      if (res.code === "AUTH_CODE_EXPIRED" || res.code === "NO_CHALLENGE") {
        setStep("phone");
        setOtp("");
      }
      toast.error(
        res.error && isAuthoredAuthMessage(res.error) ? res.error : toUserMessage(res),
      );
    }
  };

  const sheet = (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Login to continue"
        >
          <motion.div
            initial={{ opacity: 0, y: 64 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 64 }}
            transition={{ type: "spring", damping: 30, stiffness: 380 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[520px] max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-3xl bg-surface border border-border border-b-0 sm:border-b px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] shadow-2xl"
          >
            {/* Drag handle — fixed shape, never compressed */}
            <div className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-divider" aria-hidden />
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Lock className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-display text-base font-bold text-text-primary">
                  1-Tap Instant Login
                </h3>
                <p className="text-[11px] text-text-secondary">
                  Sign in to continue
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close login dialog"
              className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-bg-secondary text-text-secondary hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {step === "phone" ? (
            <form onSubmit={handleSendOtp} className="mt-4 space-y-4">
              <div>
                <label htmlFor="checkout-phone" className="block text-xs font-bold text-text-primary mb-1.5">
                  Mobile Number
                </label>
                <div className="flex items-center rounded-xl border border-border bg-bg-secondary px-3 min-h-[48px] focus-within:border-primary transition-colors">
                  <span className="text-xs font-bold text-text-primary pr-2 border-r border-border mr-2 shrink-0">
                    +91
                  </span>
                  <input
                    id="checkout-phone"
                    type="tel"
                    required
                    maxLength={10}
                    inputMode="numeric"
                    placeholder="98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                    className="w-full min-h-[44px] bg-transparent text-sm font-semibold text-text-primary outline-none"
                    autoFocus
                  />
                </div>
              </div>

              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2.5 flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-xs">
                <Sparkles className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>No password needed — we&apos;ll text a 6-digit code to verify your number.</span>
              </div>

              <button
                type="submit"
                disabled={isBusy || phone.length < 10}
                className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-full bg-primary py-3 text-xs font-bold text-white shadow-md hover:bg-primary-hover active:scale-[0.98] transition disabled:opacity-50 cursor-pointer"
              >
                <span>{isBusy ? "Sending OTP..." : "Get Verification Code"}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="mt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="checkout-otp" className="text-xs font-bold text-text-primary">
                    Enter 6-Digit OTP Code
                  </label>
                  <button
                    type="button"
                    onClick={() => setStep("phone")}
                    className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                  >
                    Change Number
                  </button>
                </div>
                {maskedPhone && (
                  <p className="mb-1.5 text-[11px] text-text-secondary">
                    Sent to {maskedPhone}
                  </p>
                )}
                <input
                  id="checkout-otp"
                  type="text"
                  required
                  maxLength={6}
                  inputMode="numeric"
                  placeholder="••••••"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  className="w-full min-h-[52px] text-center tracking-[0.4em] font-mono text-lg font-black rounded-xl border border-border bg-bg-secondary py-3 text-text-primary outline-none focus:border-primary transition-colors"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={isBusy || otp.replace(/\D/g, "").length !== 6}
                className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-full bg-primary py-3 text-xs font-bold text-white shadow-md hover:bg-primary-hover active:scale-[0.98] transition disabled:opacity-50 cursor-pointer"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>{isBusy ? "Verifying..." : "Verify & Place Order"}</span>
              </button>
            </form>
          )}

          {conflict && (
            <div
              role="status"
              className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-text-primary"
            >
              <p>
                A code was already sent to {conflict.maskedPhone || "another number"} on{" "}
                {conflict.flow}.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="font-bold text-primary underline"
                  onClick={() => {
                    const adopted = authService.adoptChallenge("checkout", conflict.handle);
                    if (!adopted.ok) {
                      toast.error(
                        adopted.code === "STALE_EPOCH"
                          ? "That sign-in attempt expired. Request a new code."
                          : "That verification session is no longer active.",
                      );
                      return;
                    }
                    setMaskedPhone(conflict.maskedPhone);
                    setConflict(null);
                    setStep("otp");
                  }}
                >
                  Resume here
                </button>
                <button
                  type="button"
                  className="font-bold text-text-secondary underline"
                  onClick={() => {
                    resetAuthAttempts();
                    setConflict(null);
                    setStep("phone");
                    setOtp("");
                  }}
                >
                  Reset and start over
                </button>
              </div>
            </div>
          )}

          <RecaptchaHost flow="checkout" />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return sheet;
  return createPortal(sheet, document.body);
}
