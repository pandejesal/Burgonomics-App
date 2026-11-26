import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ArrowLeft } from "lucide-react";
import { isIOS } from "@/shared/platform/platform";
import { HapticService } from "@/core/services/haptics";
import { useRootHeightVar } from "@/shared/hooks/useRootHeightVar";
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
  // This bar is `sticky top-0`; publish its real height so the document
  // scroller can keep a Tab-focused control from landing underneath it.
  const chromeRef = useRootHeightVar("--top-chrome-height");

  const handleBack = () => {
    void HapticService.impact("light");
    if (onBack) onBack();
  };

  const handleLinkBack = (event: React.MouseEvent<HTMLAnchorElement>) => {
    void HapticService.impact("light");
    // TanStack's browser/hash history stamps __TSR_index on every in-app push,
    // which is exactly what router.history.canGoBack() reads. A positive index
    // means there is a real screen to pop: mirror the Android hardware handler
    // (androidBackButton -> the registerRouterHistory bridge in boot.tsx,
    // whose back() is router.history.back() -> window.history.back()) instead
    // of pushing `backTo` on top of the stack. On a cold start / deep link
    // there is no in-app history, so the Link's own `replace` navigation takes
    // the customer to the parent route without growing the stack. This reuses
    // the same history; it does not register a second native listener.
    const index = (window.history.state as { __TSR_index?: unknown } | null)?.__TSR_index;
    if (typeof index === "number" && index > 0) {
      event.preventDefault();
      window.history.back();
    }
  };

  return (
    <header
      ref={chromeRef}
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
            replace
            onClick={handleLinkBack}
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
