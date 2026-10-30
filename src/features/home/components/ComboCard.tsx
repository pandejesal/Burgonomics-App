import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { AppCard } from "@/shared/components/common/AppCard";
import { AppBadge } from "@/shared/components/common/AppBadge";
import { Text } from "@/shared/components/common/Text";
import { formatINR } from "@/core/utils/format";
import { SafeImage } from "@/shared/components/common/SafeImage";
import type { Combo } from "@/features/home/models";

interface Props {
  combo: Combo;
  className?: string;
}

export function ComboCard({ combo, className }: Props) {
  const navigate = useNavigate();
  const savings = Math.max(0, combo.originalPrice - combo.price);
  const savingsPct = combo.originalPrice ? Math.round((savings / combo.originalPrice) * 100) : 0;

  const handleClick = () => {
    const productId = combo.productId || (combo.id?.startsWith("prd_") ? combo.id : undefined);
    if (productId) {
      void navigate({ to: "/menu/product/$productId", params: { productId } });
    } else {
      void navigate({ to: "/menu" });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`${combo.name}, ${combo.description}, ${formatINR(combo.price)}${savings > 0 ? `, save ${formatINR(savings)}` : ""}`}
      className="block rounded-2xl text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <AppCard
        elevation="flat"
        padded={false}
        className={cn(
          "w-[264px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-none border-0 bg-transparent shadow-none",
          className,
        )}
      >
        <div
          className={cn(
            "relative aspect-[4/3] overflow-hidden rounded-xl bg-bg-secondary",
            !combo.imageUrl && "grid place-items-center",
          )}
          aria-hidden
        >
          {savingsPct > 0 && (
            <AppBadge tone="success" className="absolute left-3 top-3 z-10 text-sm font-medium">
              Save {savingsPct}%
            </AppBadge>
          )}
          {combo.imageUrl ? (
            <SafeImage
              src={combo.imageUrl}
              fallbackSrc={combo.fallbackImageUrl}
              alt={combo.name}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="p-4 text-sm text-text-secondary">Photo unavailable</span>
          )}
        </div>
        <div className="pt-3">
          <Text as="h3" variant="titleMedium" className="text-base font-semibold leading-snug break-words">
            {combo.name}
          </Text>
          <Text variant="bodyMedium" tone="secondary" className="mt-2 text-sm leading-relaxed">
            {combo.description}
          </Text>
          <div className="mt-4 flex flex-wrap items-baseline gap-2">
            <Text as="span" variant="bodyLarge" className="text-base font-semibold text-primary-text">
              {formatINR(combo.price)}
            </Text>
            {savings > 0 && (
              <span className="text-sm text-text-secondary line-through">
                {formatINR(combo.originalPrice)}
              </span>
            )}
          </div>
        </div>
      </AppCard>
    </button>
  );
}
