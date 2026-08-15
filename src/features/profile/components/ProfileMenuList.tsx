import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Text } from "@/shared/components/common/Text";

export interface ProfileMenuItem {
  id: string;
  label: string;
  description?: string;
  to?: string;
  onClick?: () => void;
  Icon: React.ComponentType<{ className?: string }>;
  danger?: boolean;
  trailing?: React.ReactNode;
}

interface Props {
  title?: string;
  items: ProfileMenuItem[];
}

export function ProfileMenuList({ title, items }: Props) {
  return (
    <section className="space-y-2">
      {title && (
        <Text variant="caption" tone="secondary" className="uppercase tracking-wide px-1">
          {title}
        </Text>
      )}
      <ul className="overflow-hidden rounded-[var(--radius-large)] border border-divider bg-surface">
        {items.map((it, idx) => {
          const Icon = it.Icon;
          const inner = (
            <div className="flex w-full items-center gap-3 px-4 py-3 text-left">
              <div
                className={cn(
                  "grid h-9 w-9 flex-none place-items-center rounded-full",
                  it.danger ? "bg-error/10 text-error" : "bg-primary/10 text-primary",
                )}
              >
                <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <Text
                  variant="bodyLarge"
                  tone={it.danger ? "error" : "primary"}
                  className="truncate"
                >
                  {it.label}
                </Text>
                {it.description && (
                  <Text variant="caption" tone="secondary" className="truncate">
                    {it.description}
                  </Text>
                )}
              </div>
              {it.trailing}
              {!it.trailing && it.to && (
                <ChevronRight className="h-4 w-4 flex-none text-text-secondary" aria-hidden />
              )}
            </div>
          );
          return (
            <li key={it.id} className={cn(idx !== 0 && "border-t border-divider")}>
              {it.to ? (
                <Link
                  to={it.to}
                  className="block min-h-[56px] select-none transition-all duration-150 ease-out active:scale-[0.98] active:opacity-80 active:bg-primary/5 hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-none"
                >
                  {inner}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={it.onClick}
                  className="block min-h-[56px] w-full select-none transition-all duration-150 ease-out active:scale-[0.98] active:opacity-80 active:bg-primary/5 hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-none text-left"
                >
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
