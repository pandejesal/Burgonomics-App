import * as React from "react";
import { Toaster as SonnerToaster, toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * AppToaster — custom styled Sonner toaster.
 * Aligned with the premium visual aesthetics of Burgonomics.
 */
export function AppToaster() {
  return (
    <SonnerToaster
      position="bottom-center"
      closeButton
      offset="calc(5.5rem + env(safe-area-inset-bottom, 0px))"
      toastOptions={{
        classNames: {
          toast: cn(
            "group !bg-surface-elevated !text-text-primary !border !border-white/10 !shadow-[var(--shadow-high)]",
            "!rounded-2xl !p-3.5 !font-sans !text-sm flex items-center gap-3 !min-h-[52px]",
          ),
          title: "!font-semibold !text-text-primary",
          description: "!text-text-secondary !text-xs !mt-0.5",
          closeButton:
            "!bg-surface-elevated !border-white/10 !text-text-secondary hover:!text-text-primary transition-all duration-150 !right-2 !top-1/2 !-translate-y-1/2",
          actionButton:
            "!bg-primary !text-primary-foreground !rounded-full !font-semibold !text-xs !px-3.5 !py-1.5 hover:!brightness-115 transition-all",
          cancelButton:
            "!bg-transparent !text-text-secondary hover:!text-text-primary transition-all",
          success: "!border-success/30 !bg-success/5",
          error: "!border-error/30 !bg-error/5",
          warning: "!border-warning/30 !bg-warning/5",
          info: "!border-primary/30 !bg-primary/5",
        },
      }}
    />
  );
}

export { toast };
