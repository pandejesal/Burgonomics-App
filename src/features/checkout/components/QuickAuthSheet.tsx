import * as React from "react";
import { createPortal } from "react-dom";
import { X, ShieldCheck, Sparkles, ArrowRight, Lock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useAuthStore } from "@/features/auth/state/authStore";
import { HapticService } from "@/core/services/haptics";
import { useLoyaltyStore } from "@/features/loyalty/state/loyaltyStore";

interface QuickAuthSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function QuickAuthSheet({ isOpen, onClose, onSuccess }: QuickAuthSheetProps) {
  const [phone, setPhone] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [step, setStep] = React.useState<"phone" | "otp">("phone");
  const [busy, setBusy] = React.useState(false);

  const requestOtp = useAuthStore((s) => s.requestOtp);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const challenge = useAuthStore((s) => s.challenge);

  // Reset sheet state every time it opens so stale OTP/phone never leaks between attempts.
  React.useEffect(() => {
    if (isOpen) {
      setStep("phone");
      setOtp("");
      setBusy(false);
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
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }

    setBusy(true);
    void HapticService.impact("medium");

    const res = await requestOtp(`+91${cleanPhone.slice(-10)}`, "whatsapp");
    setBusy(false);

    if (res.ok) {
      setStep("otp");
      toast.success("OTP sent to your number!");
      // Auto-fill dev test code if provided
      if (challenge?.code) {
        setOtp(challenge.code);
      }
    } else {
      toast.error(res.error ?? "Failed to send OTP. Please try again.");
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 4) {
      toast.error("Please enter the complete verification code");
      return;
    }

    setBusy(true);
    void HapticService.impact("medium");

    const res = await verifyOtp(otp);
    setBusy(false);

    if (res.ok) {
      // Signup bonus: credit 50 Loyalty Points once per device.
      try {
        const flag = localStorage.getItem("burgonomics.loyalty.signupBonus");
        if (!flag) {
          useLoyaltyStore.getState().earn(50);
          localStorage.setItem("burgonomics.loyalty.signupBonus", "1");
        }
      } catch {
        // ignore storage errors
      }
      toast.success("Verified successfully!");
      onSuccess();
      onClose();
    } else {
      toast.error(res.error ?? "Invalid OTP code. Please try again.");
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
                  Complete order & unlock Loyalty Points
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-secondary text-text-secondary hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {step === "phone" ? (
            <form onSubmit={handleSendOtp} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-text-primary mb-1.5">
                  Mobile Number
                </label>
                <div className="flex items-center rounded-xl border border-border bg-bg-secondary px-3 min-h-[48px] focus-within:border-primary transition-colors">
                  <span className="text-xs font-bold text-text-primary pr-2 border-r border-border mr-2 shrink-0">
                    +91
                  </span>
                  <input
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
                <span>Get 50 Loyalty Points instantly on this order!</span>
              </div>

              <button
                type="submit"
                disabled={busy || phone.length < 10}
                className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-full bg-primary py-3 text-xs font-bold text-white shadow-md hover:bg-primary-hover active:scale-[0.98] transition disabled:opacity-50 cursor-pointer"
              >
                <span>{busy ? "Sending OTP..." : "Get Verification Code"}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="mt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-text-primary">
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
                <input
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
                disabled={busy || otp.length < 4}
                className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-full bg-primary py-3 text-xs font-bold text-white shadow-md hover:bg-primary-hover active:scale-[0.98] transition disabled:opacity-50 cursor-pointer"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>{busy ? "Verifying..." : "Verify & Place Order"}</span>
              </button>
            </form>
          )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return sheet;
  return createPortal(sheet, document.body);
}
