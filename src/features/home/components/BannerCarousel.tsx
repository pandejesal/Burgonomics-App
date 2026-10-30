import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { Banner } from "@/features/home/models";
import { SafeImage } from "@/shared/components/common/SafeImage";
import { HapticService } from "@/core/services/haptics";

const AUTOPLAY_MS = 5000;

interface Props {
  banners: Banner[];
  className?: string;
}

/** Brand fallback used whenever a banner has no (or no in-scheme) gradient. */
const BRAND_FALLBACK_GRADIENT = "linear-gradient(to bottom right, #0E4825, #1B5934)";

/**
 * 60-30-10 brand palette allowed in banner gradients (references/ui_ux_spec.md):
 * forest greens + hovers, vibrant orange accent + hover, dark-mode emerald text,
 * and the two sanctioned promo reds already in live banners. Everything else is
 * off-scheme — notably the #4A2E7A/#6D47B8 purple that shipped on banner_myob —
 * and renders as the brand green fallback instead. New sanctioned banner colors
 * must be added here (and to the spec) to render.
 */
const BRAND_GRADIENT_HEXES = new Set([
  // primary forest green + hovers
  "#0E4825",
  "#0A371C",
  "#145830",
  "#1B5934",
  "#FF6600",
  "#E55C00",
  "#4ADE80",
  // deep orange shades (dark canvas + --gradient-orange in styles.css)
  "#CC5200",
  "#B34700",
  "#9A3412",
  // in-use promo banner reds (Big Bang Meal, Peri Peri)
  "#B2452B",
  "#E06637",
  "#7A1F1F",
  "#C2452D",
]);

/**
 * Convert Tailwind gradient utility classes to CSS linear-gradient().
 * Firestore stores: "bg-gradient-to-br from-[#B2452B] to-[#E06637] text-white"
 * Returns: "linear-gradient(to bottom right, #B2452B, #E06637)"
 * Off-scheme colors (purple/blue/pink) never render — see BRAND_GRADIENT_HEXES.
 */
function parseTailwindGradient(gradient: string): string {
  if (!gradient || typeof gradient !== "string") {
    return BRAND_FALLBACK_GRADIENT;
  }

  // Extract direction: bg-gradient-to-{t|tr|r|br|b|bl|l|tl}
  const dirMatch = gradient.match(/bg-gradient-to-(t|tr|r|br|b|bl|l|tl)/i);
  const directionMap: Record<string, string> = {
    t: "to top",
    tr: "to top right",
    r: "to right",
    br: "to bottom right",
    b: "to bottom",
    bl: "to bottom left",
    l: "to left",
    tl: "to top left",
  };
  const direction = dirMatch ? directionMap[dirMatch[1]?.toLowerCase()] : "to bottom right";

  // Extract colors from from-[#HEX] to-[#HEX] — handle optional whitespace and case-insensitive hex
  const fromMatch = gradient.match(/from-\s*\[\s*#([a-fA-F0-9]{3,8})\s*\]/i);
  const toMatch = gradient.match(/to-\s*\[\s*#([a-fA-F0-9]{3,8})\s*\]/i);
  const fromColor = fromMatch ? `#${fromMatch[1].toUpperCase()}` : "#0E4825";
  const toColor = toMatch ? `#${toMatch[1].toUpperCase()}` : "#1B5934";

  // Guard: only brand-sanctioned hexes may render. Off-scheme colors (the
  // banner_myob purple, or any future blue/pink) fall back to brand green.
  if (!BRAND_GRADIENT_HEXES.has(fromColor) || !BRAND_GRADIENT_HEXES.has(toColor)) {
    return BRAND_FALLBACK_GRADIENT;
  }

  return `linear-gradient(${direction}, ${fromColor}, ${toColor})`;
}

/**
 * BannerCarousel — horizontal promo carousel.
 *
 * Touch/pen gestures stay native; mouse drags scrub the carousel.
 * Y-axis scroll chaining must stay enabled even though the shared scrollbar
 * utility contains overscroll on both axes.
 * - Colors: gradient from Firestore (Tailwind classes) parsed to CSS linear-gradient()
 *   so arbitrary runtime values work without build-time safelist.
 */
export function BannerCarousel({ banners, className }: Props) {
  const navigate = useNavigate();
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const [active, setActive] = React.useState(0);
  const [isInteracting, setIsInteracting] = React.useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);
  const suppressDragClickRef = React.useRef(false);
  const dragRef = React.useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    pointerId: number;
    axis: "pending" | "x";
    captured: boolean;
    scrollSnapType: string;
  } | null>(null);

  // A WebView can restore a partial offset on re-entry; paint the first slide
  // at its actual leading edge when the banner set changes.
  const firstBannerId = banners[0]?.id;
  React.useLayoutEffect(() => {
    if (scrollerRef.current && scrollerRef.current.scrollLeft !== 0) scrollerRef.current.scrollLeft = 0;
    setActive(0);
  }, [firstBannerId]);

  // Honour the OS motion preference: no rotation and no animated scrolling for
  // users who asked for reduced motion (WCAG 2.2.2 pause/stop/hide).
  React.useEffect(() => {
    const query =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    if (!query) return;
    const sync = () => setPrefersReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // Track active slide from scroll position (native scroll events).
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const idx = Math.round(el.scrollLeft / el.clientWidth);
      setActive(Math.max(0, Math.min(banners.length - 1, idx)));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [banners.length]);

  const scrollBehavior: ScrollBehavior = prefersReducedMotion ? "auto" : "smooth";

  // Auto-advance only while the customer is not interacting (hover, drag or
  // keyboard focus) and only when motion is allowed.
  React.useEffect(() => {
    if (isInteracting || prefersReducedMotion || banners.length <= 1) return;
    const t = window.setInterval(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const next = (active + 1) % banners.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: scrollBehavior });
    }, AUTOPLAY_MS);
    return () => window.clearInterval(t);
  }, [active, banners.length, isInteracting, prefersReducedMotion, scrollBehavior]);

  const goTo = (idx: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: idx * el.clientWidth, behavior: scrollBehavior });
  };

  // Native touch/pen scrolling owns both axes and pinch zoom. Only a mouse
  // needs JS dragging; snap must not fight its intermediate scrollLeft writes.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    suppressDragClickRef.current = false;
    if (e.pointerType !== "mouse") {
      setIsInteracting(true);
      return;
    }
    if (e.button !== 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: el.scrollLeft,
      pointerId: e.pointerId,
      axis: "pending",
      captured: false,
      scrollSnapType: el.style.scrollSnapType,
    };
    setIsInteracting(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = scrollerRef.current;
    const drag = dragRef.current;
    if (!el || !drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (drag.axis === "pending") {
      // Vertical wins ties so the page can scroll; only a clear horizontal
      // gesture becomes a carousel drag.
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) {
        dragRef.current = null;
        setIsInteracting(false);
        return;
      }
      if (Math.abs(dx) <= 10 || Math.abs(dx) <= Math.abs(dy)) return;
      drag.axis = "x";
      suppressDragClickRef.current = true;
      el.style.scrollSnapType = "none";
      if (typeof el.setPointerCapture === "function") {
        el.setPointerCapture(drag.pointerId);
        drag.captured = true;
      }
    }

    el.scrollLeft = drag.scrollLeft - dx;
  };

  const endMouseDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsInteracting(false);
    if (e.pointerType !== "mouse") return;
    const el = scrollerRef.current;
    const drag = dragRef.current;
    if (!el || !drag || e.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (drag.axis !== "x") return;
    el.style.scrollSnapType = drag.scrollSnapType;
    if (drag.captured && el.hasPointerCapture(drag.pointerId)) {
      el.releasePointerCapture(drag.pointerId);
    }
    if (el.clientWidth > 0) {
      const nearest = Math.max(0, Math.min(banners.length - 1, Math.round(el.scrollLeft / el.clientWidth)));
      goTo(nearest);
    }
  };

  const suppressDragClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Keyboard clicks have detail 0 and must still activate the real link.
    if (!suppressDragClickRef.current || e.detail === 0) return;
    suppressDragClickRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  if (banners.length === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Promotional banners"
      className={cn("relative w-full select-none", className)}
      onPointerEnter={() => setIsInteracting(true)}
      onPointerLeave={() => setIsInteracting(false)}
      onFocus={() => setIsInteracting(true)}
      onBlur={() => setIsInteracting(false)}
    >
      <div
        ref={scrollerRef}
        className="flex w-full overflow-x-auto no-scrollbar snap-x snap-mandatory overscroll-x-contain"
        style={{
          WebkitOverflowScrolling: "touch",
          touchAction: "auto",
          overscrollBehaviorY: "auto",
          overflowAnchor: "none",
          scrollPaddingInline: "0px",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endMouseDrag}
        onPointerCancel={endMouseDrag}
        onLostPointerCapture={endMouseDrag}
        onClickCapture={suppressDragClick}
      >
        {banners.map((b, i) => (
          <a
            key={b.id}
            href={b.ctaHref}
            // A native link is draggable; without this the desktop pointer-drag
            // swipe would start a link drag instead of scrubbing the carousel.
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            onClick={(e) => {
              // Client-side routing, but the href keeps the slide focusable,
              // Enter-activatable and openable in a new tab.
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              void HapticService.selection();
              void navigate({ to: b.ctaHref });
            }}
            className="block w-full min-w-0 shrink-0 px-4 snap-start cursor-pointer"
          >
            <div
              role="group"
              aria-roledescription="slide"
              aria-label={`${b.title}. ${b.subtitle}. ${b.ctaLabel}`}
              // Larger image-led promo (2:1, 180px floor). Height is a minimum
              // and the ratio is preferred, so 200% text grows the slide instead
              // of clipping it; the photo layer clips, the text never does.
              className={cn(
                "relative flex w-full min-h-[180px] aspect-[2/1] items-end rounded-xl text-left transition-transform duration-200 active:scale-[0.99]",
                "text-white",
              )}
            >
              <div aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-xl">
                {b.imageUrl ? (
                  <SafeImage
                    src={b.imageUrl}
                    fallbackSrc={b.fallbackImageUrl}
                    alt=""
                    loading={i === 0 ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={i === 0 ? "high" : undefined}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div
                    className="h-full w-full"
                    style={{
                      background: b.gradient ? parseTailwindGradient(b.gradient) : BRAND_FALLBACK_GRADIENT,
                    }}
                  />
                )}
              </div>

              {/* Readable scrim under the text only; the poster stays visible above it. */}
              <div
                aria-hidden="true"
                className="absolute inset-0 rounded-xl bg-gradient-to-t from-black/80 via-black/35 to-black/5"
              />

              <div className="relative z-10 w-full px-4 pb-3.5 pt-8">
                <h2 className="type-brand-heading break-words text-lg leading-snug text-white sm:text-xl">
                  {b.title}
                </h2>
                <p className="mt-0.5 break-words text-sm font-normal leading-snug text-white/90">
                  {b.subtitle}
                </p>
                <span className="mt-2 inline-flex min-h-8 items-center rounded-full bg-white/95 px-3 py-1 text-xs font-semibold leading-snug text-text-primary dark:text-text-inverse">
                  {b.ctaLabel || "Order now"}
                </span>
              </div>
            </div>
          </a>
        ))}
      </div>

      {banners.length > 1 && (
        // Indicators occupy a reserved 28px band directly under the poster.
        // Each control keeps a 44px pointer target that overflows the band
        // invisibly, so the gap to the Menu row stays tight without shrinking
        // the hit area or overlapping the slide's CTA.
        <div role="tablist" aria-label="Select banner" className="flex h-7 items-center justify-center gap-1">
          {banners.map((b, idx) => (
            <button
              key={b.id}
              role="tab"
              type="button"
              aria-selected={idx === active}
              aria-label={`Go to banner ${idx + 1}`}
              onClick={() => goTo(idx)}
              className="grid h-11 w-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "block h-2 rounded-full transition-all duration-300",
                  idx === active
                    ? "w-6 bg-primary dark:bg-primary-text"
                    : "w-2 bg-text-secondary",
                )}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
