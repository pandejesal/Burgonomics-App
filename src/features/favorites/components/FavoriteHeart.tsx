import * as React from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { favoritesRepository } from "@/features/favorites/repositories/FavoritesRepository";
import { useFavoritesStore } from "@/features/favorites/state/favoritesStore";
import type { Favorite, FavoriteKind } from "@/features/favorites/models";
import { toast } from "sonner";

import { motion } from "motion/react";

interface Props {
  kind: FavoriteKind;
  refId: string;
  name: string;
  imageUrl?: string;
  fallbackImageUrl?: string;
  priceLabel?: string;
  className?: string;
  /** Optional label override for a11y. Defaults to a sensible one. */
  ariaLabel?: string;
}

/**
 * FavoriteHeart — reusable optimistic toggle. Reads live favorited
 * state from `useFavoritesStore` so every mounted heart updates
 * instantly when the underlying favorite is added/removed anywhere.
 */
export function FavoriteHeart({
  kind,
  refId,
  name,
  imageUrl,
  fallbackImageUrl,
  priceLabel,
  className,
  ariaLabel,
}: Props) {
  const favorited = useFavoritesStore((s) =>
    s.items.some((f) => f.kind === kind && f.refId === refId),
  );
  const [busy, setBusy] = React.useState(false);

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const payload: Omit<Favorite, "id" | "addedAt"> = {
      kind,
      refId,
      name,
      imageUrl,
      fallbackImageUrl,
      priceLabel,
    };
    const res = await favoritesRepository.toggle(payload);
    setBusy(false);
    if (!res.success) {
      toast.error("Couldn't update favourites");
      return;
    }
    toast.success(res.data.favorited ? "Added to favourites" : "Removed from favourites");
  };

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={favorited}
      aria-label={
        ariaLabel ?? (favorited ? `Remove ${name} from favourites` : `Add ${name} to favourites`)
      }
      whileTap={{ scale: 0.8 }}
      animate={favorited ? { scale: [1, 1.3, 1] } : { scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-full bg-surface/90 backdrop-blur",
        "border border-divider",
        favorited ? "text-error" : "text-text-secondary hover:text-error",
        className,
      )}
    >
      <Heart className={cn("h-4 w-4 transition-all", favorited && "fill-current")} aria-hidden />
    </motion.button>
  );
}
