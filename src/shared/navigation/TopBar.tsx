import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ArrowLeft } from "lucide-react";
import { isIOS } from "@/shared/platform/platform";
import { HapticService } from "@/core/services/haptics";
import { cn } from "@/lib/utils";

interface TopBarProps {
  title: string;
  backTo?: string;
  onBack?: () => void;
  rightSlot?: React.ReactNode;
  className?: string;
}

export function TopBar({ title, backTo, onBack, rightSlot, className }: TopBarProps) {
  const ios = isIOS();
  const BackIcon = ios ? ChevronLeft : ArrowLeft;

  const handleBack = () => {
    void HapticService.impact("light");
    if (onBack) onBack();
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex min-h-[calc(3.5rem_+_env(safe-area-inset-top,0px))] items-center gap-2 border-b border-divider bg-surface/95 px-2 pt-[env(safe-area-inset-top,0px)] text-text-primary backdrop-blur-md",
        ios && "justify-between",
        className,
      )}
    >
      {backTo || onBack ? (
        onBack ? (
          <button
            type="button"
            onClick={handleBack}
            aria-label="Go back"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full select-none text-text-primary transition-all duration-150 hover:bg-bg-secondary active:scale-90 active:opacity-75"
          >
            <BackIcon className={cn(ios ? "h-6 w-6" : "h-5 w-5")} aria-hidden />
          </button>
        ) : (
          <Link
            to={backTo!}
            onClick={() => void HapticService.impact("light")}
            aria-label="Go back"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full select-none text-text-primary transition-all duration-150 hover:bg-bg-secondary active:scale-90 active:opacity-75"
          >
            <BackIcon className={cn(ios ? "h-6 w-6" : "h-5 w-5")} aria-hidden />
          </Link>
        )
      ) : (
        <div className="h-11 w-11 shrink-0" />
      )}

      <h1
        className={cn(
          "type-title-large min-w-0 flex-1 truncate px-1 text-text-primary",
          ios ? "text-center" : "text-left",
        )}
      >
        {title}
      </h1>

      {rightSlot ? (
        <div className="flex h-11 w-11 shrink-0 items-center justify-end">{rightSlot}</div>
      ) : (
        <div className="h-11 w-11 shrink-0" />
      )}
    </header>
  );
}
