import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { BottomTabBar } from "@/shared/navigation/BottomTabBar";
import { TopBar } from "@/shared/navigation/TopBar";
import { OfflineBanner } from "./OfflineBanner";
import { PageTransition } from "@/shared/components/common/PageTransition";

import { ConsentBanner } from "@/shared/components/common/ConsentBanner";

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  backTo?: string;
  rightSlot?: React.ReactNode;
  showTabs?: boolean;
  showTopBar?: boolean;
  contentClassName?: string;
  bottomSlot?: React.ReactNode;
}

/** Phone-first mobile shell with optional top bar + bottom tab nav. */
export function AppShell({
  children,
  title,
  backTo,
  rightSlot,
  showTabs = true,
  showTopBar = true,
  contentClassName,
  bottomSlot,
}: AppShellProps) {
  const isMounted = typeof document !== "undefined";

  return (
    <div className="app-shell" vaul-drawer-wrapper="">
      <OfflineBanner />
      <ConsentBanner />
      {showTopBar && title && <TopBar title={title} backTo={backTo} rightSlot={rightSlot} />}
      <main
        className={cn(
          "min-h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px))]",
          !showTopBar && "pt-[env(safe-area-inset-top,0px)]",
          showTabs && "pb-[calc(88px+env(safe-area-inset-bottom,0px))]",
          contentClassName,
        )}
      >
        <PageTransition>{children}</PageTransition>
      </main>
      {bottomSlot && (isMounted ? createPortal(bottomSlot, document.body) : bottomSlot)}
      {showTabs && isMounted && createPortal(<BottomTabBar />, document.body)}
    </div>
  );
}
