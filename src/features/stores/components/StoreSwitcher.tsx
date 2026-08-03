import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Text } from "@/shared/components/common/Text";
import { useStoreSelection } from "@/features/stores/state/storeStore";

interface StoreSwitcherProps {
  className?: string;
  /** Where to go when tapped. Defaults to the Store Selection screen. */
  to?: string;
}

/**
 * Reusable store switcher — designed to sit in the Home header (and
 * anywhere else the current store needs to surface). Tap to open the
 * Store Selection screen.
 */
export function StoreSwitcher({ className, to = "/stores" }: StoreSwitcherProps) {
  const store = useStoreSelection((s) => s.activeStore);

  return (
    <Link
      to={to}
      aria-label={store ? `Change store. Current: ${store.name}, ${store.area}` : "Choose a store"}
      className={cn(
        "group inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-full",
        "border border-divider bg-surface px-3 py-1.5",
        "hover:border-primary/40 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex flex-col leading-tight">
        <Text variant="caption" tone="secondary" className="truncate">
          {store ? "Delivering from" : "Choose a store"}
        </Text>
        <Text variant="labelLarge" className="truncate">
          {store ? store.name : "Select store"}
        </Text>
      </div>
      <ChevronDown
        className="h-4 w-4 shrink-0 text-text-secondary transition-transform group-hover:text-text-primary"
        aria-hidden
      />
    </Link>
  );
}
