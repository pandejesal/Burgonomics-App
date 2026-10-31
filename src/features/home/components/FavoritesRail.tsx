import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { SafeImage } from "@/shared/components/common/SafeImage";
import { useFavoritesStore } from "@/features/favorites/state/favoritesStore";
import type { Favorite } from "@/features/favorites/models";
import { HorizontalRail } from "./HorizontalRail";
import { SectionHeader } from "./SectionHeader";

/** Rail bound. The full list lives on /profile/favorites. */
export const DEFAULT_FAVORITES_RAIL_LIMIT = 8;

export interface FavoritesRailProps {
  /** Maximum cards rendered. Defaults to DEFAULT_FAVORITES_RAIL_LIMIT. */
  limit?: number;
  className?: string;
}

const CARD_CLASS =
  "flex w-[136px] shrink-0 flex-col gap-2 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Card body — name plus a REAL stored image when one exists.
 *
 * Deliberately no price, no stock state and no Add control: this lane is
 * navigation only. Availability and price belong to the store-scoped catalog
 * (the product route / menu), so the rail cannot invent either. A favourite
 * with no `imageUrl` renders the heart glyph rather than SafeImage, because
 * SafeImage substitutes a placeholder graphic that would read as a real photo.
 */
function FavoriteCardBody({ favorite }: { favorite: Favorite }) {
  return (
    <>
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-primary/10">
        {favorite.imageUrl ? (
          <SafeImage
            src={favorite.imageUrl}
            fallbackSrc={favorite.fallbackImageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-primary-text">
            <Heart className="h-5 w-5 fill-primary/20" aria-hidden />
          </div>
        )}
      </div>
      <p className="line-clamp-2 text-sm font-semibold leading-snug break-words text-text-primary">
        {favorite.name}
      </p>
    </>
  );
}

/**
 * One destination per stored kind, using only identifiers the favourite
 * actually holds:
 *   product  → /menu/product/$productId (refId)
 *   category → /menu?category=<refId>   (real stored category id)
 *   combo    → /profile/favorites       (no product/category mapping exists to invent)
 */
function FavoriteCard({ favorite }: { favorite: Favorite }) {
  if (favorite.kind === "category") {
    return (
      <Link to="/menu" search={{ category: favorite.refId }} className={CARD_CLASS}>
        <FavoriteCardBody favorite={favorite} />
      </Link>
    );
  }
  if (favorite.kind === "product") {
    return (
      <Link
        to="/menu/product/$productId"
        params={{ productId: favorite.refId }}
        className={CARD_CLASS}
      >
        <FavoriteCardBody favorite={favorite} />
      </Link>
    );
  }
  return (
    <Link to="/profile/favorites" className={CARD_CLASS}>
      <FavoriteCardBody favorite={favorite} />
    </Link>
  );
}

/**
 * Home favourites lane.
 *
 * Reads `useFavoritesStore` DIRECTLY during render and never copies rows into
 * component state: the store re-scopes its items synchronously on an auth uid
 * change (favoritesStore.onAuthUidChange) and on clear(), so a live selector
 * makes an account switch or an emptied store drop the previous owner's cards
 * on the same commit. A useState copy would paint them once more — the leak
 * this lane must not introduce.
 *
 * Renders nothing at all (no heading, no skeleton, no placeholder) when there
 * are no favourites, and issues no network request of any kind: there is no
 * catalog, order or provider read behind this component.
 */
export function FavoritesRail({
  limit = DEFAULT_FAVORITES_RAIL_LIMIT,
  className,
}: FavoritesRailProps) {
  const items = useFavoritesStore((state) => state.items);
  const visible = limit > 0 ? items.slice(0, limit) : items;

  if (visible.length === 0) return null;

  return (
    <section aria-labelledby="favorites-rail-heading" className={cn("pt-4", className)}>
      <SectionHeader
        id="favorites-rail-heading"
        title="Your favourites"
        actionLabel="View all"
        actionTo="/profile/favorites"
      />
      <HorizontalRail ariaLabel="Your favourite items">
        {visible.map((favorite) => (
          <FavoriteCard key={favorite.id} favorite={favorite} />
        ))}
      </HorizontalRail>
    </section>
  );
}

export default FavoritesRail;
