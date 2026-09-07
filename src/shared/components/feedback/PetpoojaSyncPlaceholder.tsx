import * as React from "react";
import { motion } from "motion/react";
import { Radio } from "lucide-react";
import { BrandMascot } from "../common/BrandMascot";
import { Text } from "../common/Text";

interface PetpoojaSyncPlaceholderProps {
  storeId?: string;
  className?: string;
}

export function PetpoojaSyncPlaceholder({ className }: PetpoojaSyncPlaceholderProps) {
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

          {/* Status Badge */}
          <span className="absolute -bottom-2 right-4 flex h-6 items-center gap-1.5 rounded-full border border-primary bg-bg px-2.5 shadow-md">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span className="text-[10px] font-mono font-bold tracking-wider text-amber-500 uppercase">
              Awaiting Sync
            </span>
          </span>
        </div>
      </div>

      {/* Info Section */}
      <Text variant="headlineMedium" className="tracking-tight text-text">
        Cooking up the Menu!
      </Text>

      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-divider bg-bg-secondary px-3 py-1 text-xs text-text-secondary">
        <Radio className="h-3.5 w-3.5 text-primary animate-pulse" />
        <span className="font-mono">Listening on Petpooja V2.1.0 API</span>
      </div>

      <Text variant="bodyMedium" tone="secondary" className="mt-4 max-w-[24rem]">
        This outlet's menu, pricing, and live inventory statuses are controlled directly from the
        merchant's <strong>Petpooja POS terminal</strong>.
      </Text>

      <p className="mt-2 text-xs text-text-secondary max-w-[22rem] italic">
        When a manager updates the menu on the billing machine, this screen automatically updates
        with fresh burgers, prices, and stock indicators.
      </p>
    </div>
  );
}
