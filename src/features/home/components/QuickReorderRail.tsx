import * as React from "react";
import { Repeat } from "lucide-react";
import { AppCard } from "@/shared/components/common/AppCard";
import { AppButton } from "@/shared/components/common/AppButton";
import { Text } from "@/shared/components/common/Text";
import { formatINR } from "@/core/utils/format";
import { HorizontalRail } from "./HorizontalRail";
import type { QuickReorderItem } from "@/features/home/models";

interface Props {
  items: QuickReorderItem[];
  onReorder?: (item: QuickReorderItem) => void;
}

export function QuickReorderRail({ items, onReorder }: Props) {
  if (items.length === 0) return null;
  return (
    <HorizontalRail ariaLabel="Quick reorder">
      {items.map((it) => (
        <AppCard key={it.id} elevation="low" padded className="flex w-[260px] flex-col gap-2">
          <div className="flex items-start gap-2">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <Repeat className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <Text variant="titleMedium" className="line-clamp-1">
                {it.title}
              </Text>
              <Text variant="caption" tone="secondary">
                {it.subtitle}
              </Text>
            </div>
          </div>
          <div className="mt-auto flex items-center justify-between pt-1">
            <Text variant="labelLarge">{formatINR(it.total)}</Text>
            <AppButton
              size="sm"
              variant="outlined"
              onClick={() => onReorder?.(it)}
              aria-label={`Reorder ${it.title}`}
            >
              Reorder
            </AppButton>
          </div>
        </AppCard>
      ))}
    </HorizontalRail>
  );
}
