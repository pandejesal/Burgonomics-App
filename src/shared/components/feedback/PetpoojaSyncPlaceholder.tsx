import * as React from "react";
import { motion } from "motion/react";
import { RefreshCw } from "lucide-react";
import { BrandMascot } from "../common/BrandMascot";
import { Text } from "../common/Text";

interface PetpoojaSyncPlaceholderProps {
  storeId?: string;
  className?: string;
  /** Optional retry hook — wired by routes so empty states aren't a dead end. */
  onRetry?: () => void;
}

export function PetpoojaSyncPlaceholder({ className, onRetry }: PetpoojaSyncPlaceholderProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-6 py-12 text-center w-full max-w-lg mx-auto ${className || ""}`}
    >
      {/* Visual Container */}
      <div className="relative mb-8">
        {/* Glow rings */}
        <div className="absolute inset-0 -m-6 animate-pulse rounded-full bg-primary/5 blur-xl" />
        <div className="absolute inset-0 -m-12 animate-pulse rounded-full bg-primary/5 blur-2xl opacity-50" />

        {/* Radial Pulse Wave */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            className="h-32 w-32 rounded-full border border-primary/20 bg-primary/5"
            animate={{
              scale: [1, 1.4, 1.8],
              opacity: [0.6, 0.3, 0],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
        </div>

        {/* Mascot Wrapper */}
        <div className="relative z-10 flex h-40 w-40 items-center justify-center rounded-full border border-divider bg-surface shadow-[var(--shadow-medium)] overflow-visible">
          <BrandMascot size={110} float className="z-10" />
        </div>
      </div>

      {/* Info Section — neutral, actionable copy. Vendor/API details belong in
          console/telemetry only, never on customer-facing screens. */}
      <Text variant="headlineMedium" className="tracking-tight text-text">
        This outlet's menu isn't available yet
      </Text>

      <Text variant="bodyMedium" tone="secondary" className="mt-4 max-w-[24rem]">
        Menu items for this outlet aren't published right now. Try again, or pick
        another outlet to see its menu.
      </Text>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-white hover:bg-primary-hover active:scale-[0.98] transition cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          <span>Try again</span>
        </button>
      )}
    </div>
  );
}
