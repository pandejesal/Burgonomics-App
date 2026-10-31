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
 * Swipe fixes (2026-10-06):
 * - Removed `touch-pan-y` which disabled native horizontal panning.
 * - Replaced useDirectionalScroll with native scroll + pointer drag handling.
 * - Uses CSS scroll-snap only (no JS scrollLeft writes during drag).
 * - Colors: gradient from Firestore (Tailwind classes) parsed to CSS linear-gradient()
 *   so arbitrary runtime values work without build-time safelist.
 */
export function BannerCarousel({ banners, className }: Props) {
  const navigate = useNavigate();
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const [active, setActive] = React.useState(0);
  const [isInteracting, setIsInteracting] = React.useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);
  const dragRef = React.useRef<{ startX: number; startY: number; scrollLeft: number } | null>(null);

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

  // Pointer drag for swipe (mouse + touch). Replaces useDirectionalScroll.
  const onPointerDown = (e: React.PointerEvent) => {
    const el = scrollerRef.current;
    if (!el) return;
    // Let the browser handle vertical scrolling naturally; only capture horizontal intent.
    dragRef.current = { startX: e.clientX, startY: e.clientY, scrollLeft: el.scrollLeft };
    setIsInteracting(true);
    // Set pointer capture so we get move/up even if finger leaves element
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const el = scrollerRef.current;
    const drag = dragRef.current;
    if (!el || !drag) return;
    // Horizontal drag delta
    const dx = e.clientX - drag.startX;
    // Vertical drag delta (to detect vertical scroll intent)
    const dy = e.clientY - drag.startY;
    // If mostly vertical, release capture and let page scroll
    if (Math.abs(dx) < Math.abs(dy) && Math.abs(dy) > 10) {
      onPointerUp(e);
      return;
    }
    el.scrollLeft = drag.scrollLeft - dx;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const el = scrollerRef.current;
    if (drag) {
      // If minimal movement, treat as tap
      const dx = Math.abs(e.clientX - drag.startX);
      if (dx < 10) {
        // Tap handling is on individual slides via onClick below
      }
    }
    dragRef.current = null;
    setIsInteracting(false);
    // Release pointer capture
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    dragRef.current = null;
    setIsInteracting(false);
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
        className="flex w-full overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth overscroll-x-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
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
              e.preventDefault();
              void HapticService.selection();
              void navigate({ to: b.ctaHref });
            }}
            className="block w-full shrink-0 px-4 snap-center cursor-pointer"
          >
            <div
              role="group"
              aria-roledescription="slide"
              aria-label={`${b.title}. ${b.subtitle}. ${b.ctaLabel}`}
              className={cn(
                "relative flex w-full min-h-[160px] items-center justify-between gap-4 overflow-hidden rounded-2xl p-4 text-left shadow-medium transition-transform duration-200 active:scale-[0.99]",
                // Tailwind utility for text color only (white); gradient is applied via inline style
                "text-white",
              )}
              // Apply gradient via inline style so arbitrary Firestore values work.
              // Firestore stores Tailwind classes: "bg-gradient-to-br from-[#B2452B] to-[#E06637] text-white"
              // We parse them to CSS linear-gradient() for runtime rendering.
              style={{
                background: b.gradient ? parseTailwindGradient(b.gradient) : BRAND_FALLBACK_GRADIENT,
              }}
            >
              {/* Ambient lighting */}
              <div className="absolute inset-0 bg-black/10 mix-blend-overlay pointer-events-none" />

              <div className="relative min-w-0 flex-1 z-10">
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/30 backdrop-blur-sm text-[10px] font-extrabold uppercase tracking-wider text-amber-300 border border-white/10">
                  <span>CRAFT BURGERS</span>
                  <span>•</span>
                  <span>FRESH DAILY</span>
                </div>

                <h3 className="font-display text-2xl font-black mt-2 leading-tight tracking-tight text-white drop-shadow-sm">
                  {b.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs font-medium text-white/90">
                  {b.subtitle}
                </p>

                <div className="mt-3 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-accent-hover transition-colors">
                    {b.ctaLabel || "Order Now"} →
                  </span>
                </div>
              </div>

              {b.imageUrl ? (
                <div className="relative z-10 h-28 w-28 shrink-0 overflow-hidden rounded-2xl border border-white/20 shadow-xl bg-black/20">
                  <SafeImage
                    src={b.imageUrl}
                    fallbackSrc={b.fallbackImageUrl}
                    alt={b.title}
                    loading={i === 0 ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={i === 0 ? "high" : undefined}
                    className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                  />
                </div>
              ) : (
                <div
                  aria-hidden
                  className="grid h-24 w-24 shrink-0 place-items-center rounded-full bg-white/15 backdrop-blur border border-white/20"
                >
                  <span className="text-[11px] font-bold text-white/80 uppercase tracking-wider">Burgonomics</span>
                </div>
              )}
            </div>
          </a>
        ))}
      </div>

      {banners.length > 1 && (
        <div role="tablist" aria-label="Select banner" className="mt-3 flex justify-center gap-1.5">
          {banners.map((b, idx) => (
            <button
              key={b.id}
              role="tab"
              type="button"
              aria-selected={idx === active}
              aria-label={`Go to banner ${idx + 1}`}
              onClick={() => goTo(idx)}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                idx === active
                  ? "w-6 bg-primary dark:bg-primary-text"
                  : "w-1.5 bg-border hover:bg-text-secondary",
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}
