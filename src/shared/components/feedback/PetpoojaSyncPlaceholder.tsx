import * as React from "react";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Radio, Terminal, ChevronRight } from "lucide-react";
import { BrandMascot } from "../common/BrandMascot";
import { Text } from "../common/Text";

interface PetpoojaSyncPlaceholderProps {
  storeId?: string;
  className?: string;
}

export function PetpoojaSyncPlaceholder({ className }: PetpoojaSyncPlaceholderProps) {
  const [showLogs, setShowLogs] = useState(false);

  const mockWebhookLogs = [
    { time: "10:42:01", event: "Webhook listening on /api/petpooja/menu_push...", type: "system" },
    {
      time: "10:42:02",
      event: "Awaiting push trigger from Petpooja POS client applet...",
      type: "pending",
    },
    {
      time: "10:42:05",
      event: "Menu changes made on the Petpooja POS billing machine automatically sync here.",
      type: "tip",
    },
  ];

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

      {/* Sync Status / Logs */}
      <div className="mt-8 w-full rounded-2xl border border-divider bg-surface p-4 shadow-sm">
        <div className="space-y-3">
          <button
            type="button"
            className="w-full flex items-center justify-between text-left px-3 py-2 rounded-lg bg-bg-secondary hover:bg-divider transition-colors cursor-pointer"
            onClick={() => setShowLogs(!showLogs)}
          >
            <span className="text-xs font-mono text-text-secondary flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5" />
              View Sync Telemetry / Webhook Status
            </span>
            <ChevronRight
              className={`h-4 w-4 text-text-secondary transition-transform duration-200 ${showLogs ? "rotate-90" : ""}`}
            />
          </button>

          <AnimatePresence>
            {showLogs && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-neutral-950 text-neutral-200 text-left rounded-xl p-3 font-mono text-[11px] space-y-1.5 border border-neutral-800 shadow-inner max-h-[140px] overflow-y-auto no-scrollbar">
                  {mockWebhookLogs.map((log, index) => (
                    <div key={index} className="flex gap-2 leading-relaxed">
                      <span className="text-neutral-500 shrink-0">{log.time}</span>
                      <span
                        className={
                          log.type === "tip"
                            ? "text-amber-400"
                            : log.type === "pending"
                              ? "text-emerald-400"
                              : "text-neutral-300"
                        }
                      >
                        {log.event}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
