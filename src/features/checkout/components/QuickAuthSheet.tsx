import * as React from "react";
import { createPortal } from "react-dom";
import { X, ShieldCheck, ArrowRight, Lock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useAuthStore } from "@/features/auth/state/authStore";
import { sanitizePhone, validateOtp, validatePhone } from "@/features/auth/utils/validators";
import { HapticService } from "@/core/services/haptics";
import { toUserMessage } from "@/core/errors/userMessages";
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

    const res = await requestOtp(`+91${sanitizePhone(phone)}`, "whatsapp");
    setBusy(false);

    if (res.ok) {
      setStep("otp");
      toast.success("OTP sent to your number!");
    } else {
      // P1-13: the store hands back the raw Firebase message — never toast it.
      console.error("[auth] checkout OTP request failed:", res.error);
      toast.error(toUserMessage(res));
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

    const res = await verifyOtp(otp);
    setBusy(false);

    if (res.ok) {
      // Loop 65/120: no local signup mint. The old code credited 50 phantom
      // points per device with zero server backing (clearing storage
      // re-minted them); the server ledger is the sole minter. Refresh from
      // truth instead — new customers correctly see zero.
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
      // P1-13: raw `Firebase: Error (auth/invalid-verification-code).` etc.
      console.error("[auth] checkout OTP verify failed:", res.error);
      toast.error(toUserMessage(res));
    }
  };

  const sheet = (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-text-primary/40 p-0 backdrop-blur-sm sm:items-center sm:p-4 dark:bg-background/70"
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
            className="max-h-[92dvh] w-full max-w-[520px] overflow-y-auto overscroll-contain rounded-t-[var(--radius-xlarge)] border border-border border-b-0 bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-3 shadow-2xl sm:rounded-[var(--radius-xlarge)] sm:border-b"
          >
            {/* Drag handle — fixed shape, never compressed */}
            <div className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-divider" aria-hidden />
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Lock className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0">
                  <h3 className="type-title-large text-text-primary">1-Tap Instant Login</h3>
                  <p className="type-caption text-text-secondary">Sign in to continue</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close login dialog"
                className="flex h-11 w-11 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full bg-bg-secondary text-text-secondary transition-colors hover:text-text-primary"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {step === "phone" ? (
              <form onSubmit={handleSendOtp} className="mt-4 space-y-4">
                <div>
                  <label
                    htmlFor="checkout-phone"
                    className="mb-1.5 block type-caption font-medium text-text-primary"
                  >
                    Mobile Number
                  </label>
                  <div className="flex min-h-12 items-center rounded-[var(--radius-medium)] border border-border bg-bg-secondary px-3 transition-colors focus-within:border-primary">
                    <span className="mr-2 shrink-0 border-r border-border pr-2 type-caption font-semibold text-text-primary">
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
                      className="min-h-11 w-full bg-transparent text-base font-semibold text-text-primary outline-none"
                      autoFocus
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy || phone.length < 10}
                  className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-primary py-3 type-button text-primary-foreground shadow-md transition-colors hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50"
                >
                  <span>{busy ? "Sending OTP..." : "Get Verification Code"}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="mt-4 space-y-4">
                <div>
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor="checkout-otp"
                      className="type-caption font-medium text-text-primary"
                    >
                      Enter 6-Digit OTP Code
                    </label>
                    <button
                      type="button"
                      onClick={() => setStep("phone")}
                      className="-mr-2 inline-flex min-h-11 cursor-pointer items-center px-2 type-caption font-semibold text-primary-text hover:underline"
                    >
                      Change Number
                    </button>
                  </div>
                  <input
                    id="checkout-otp"
                    type="text"
                    required
                    maxLength={6}
                    inputMode="numeric"
                    placeholder="••••••"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    className="min-h-[52px] w-full rounded-[var(--radius-medium)] border border-border bg-bg-secondary py-3 text-center text-lg font-semibold tracking-[0.4em] text-text-primary outline-none transition-colors focus:border-primary"
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy || otp.replace(/\D/g, "").length !== 6}
                  className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-primary py-3 type-button text-primary-foreground shadow-md transition-colors hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden />
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
