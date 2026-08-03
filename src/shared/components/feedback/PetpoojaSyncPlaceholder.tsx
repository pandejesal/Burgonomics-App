import * as React from "react";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { RefreshCw, Radio, Terminal, CheckCircle2, ChevronRight, Sparkles } from "lucide-react";
import { BrandMascot } from "../common/BrandMascot";
import { Text } from "../common/Text";
import { AppButton } from "../common/AppButton";
import { useDemoStore } from "@/features/demo/state/demoStore";
import { useMenuStore } from "@/features/menu/state/menuStore";
import { toast } from "sonner";

interface PetpoojaSyncPlaceholderProps {
  storeId?: string;
  onSyncComplete?: () => void;
  className?: string;
}

export function PetpoojaSyncPlaceholder({
  storeId,
  onSyncComplete,
  className,
}: PetpoojaSyncPlaceholderProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const setSimulationMode = useDemoStore((s) => s.setSimulationMode);
  const loadMenu = useMenuStore((s) => s.load);

  const handleSimulateSync = async () => {
    setIsSyncing(true);
    toast.info("Connecting to Petpooja POS server...", { duration: 1500 });

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1800));

    setSimulationMode(true);
    if (storeId) {
      await loadMenu(storeId, { refresh: true });
    }

    setIsSyncing(false);
    toast.success("Petpooja menu sync complete!", {
      description: "Successfully synced categories, products, and addons.",
      duration: 3000,
    });

    if (onSyncComplete) {
      onSyncComplete();
    }
  };

  const mockWebhookLogs = [
    { time: "10:42:01", event: "Webhook listening on /api/petpooja/menu_push...", type: "system" },
    {
      time: "10:42:02",
      event: "Awaiting push trigger from Petpooja POS client applet...",
      type: "pending",
    },
    {
      time: "10:42:05",
      event: "Tip: Click 'Enable Mock Simulation' below to push simulated POS dataset.",
      type: "tip",
    },
  ];

  return (
    <div
      className={`flex flex-col items-center justify-center px-6 py-12 text-center max-w-lg mx-auto ${className || ""}`}
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
        When a manager taps "Push Menu" on the billing machine, this screen instantly updates with
        fresh burgers, prices, and stock indicators.
      </p>

      {/* Controller Controls (Highly functional and delightfully explains mock environment) */}
      <div className="mt-8 w-full rounded-2xl border border-divider bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-divider pb-3 mb-3 text-left">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              Demo Environment Actions
            </p>
            <p className="text-[11px] text-text-secondary mt-0.5">
              Simulate menu synchronization from a mock POS terminal
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <AppButton
            variant="primary"
            size="md"
            className="w-full justify-center gap-2 relative overflow-hidden"
            onClick={handleSimulateSync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Syncing POS Catalogue...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Trigger Petpooja POS Mock Sync
              </>
            )}
          </AppButton>

          <button
            type="button"
            className="w-full flex items-center justify-between text-left px-3 py-2 rounded-lg bg-bg-secondary hover:bg-divider transition-colors"
            onClick={() => setShowLogs(!showLogs)}
          >
            <span className="text-xs font-mono text-text-secondary flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5" />
              View Sync Endpoints / Live Webhook Logs
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
                  {isSyncing && (
                    <div className="flex gap-2 text-emerald-400 animate-pulse mt-1">
                      <span>•</span>
                      <span>Receiving menu push payload chunk... (100% processed)</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
