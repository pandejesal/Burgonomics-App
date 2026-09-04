import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { Banner } from "@/features/home/models";
import { SafeImage } from "@/shared/components/common/SafeImage";
import { HapticService } from "@/core/services/haptics";
import { useDirectionalScroll } from "@/shared/hooks/useDirectionalScroll";

const AUTOPLAY_MS = 5000;

interface Props {
  banners: Banner[];
  className?: string;
}

export function BannerCarousel({ banners, className }: Props) {
  const navigate = useNavigate();
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const [active, setActive] = React.useState(0);
  const [isInteracting, setIsInteracting] = React.useState(false);
  const dragStartRef = React.useRef<{ x: number; y: number } | null>(null);

  // Directional scroll: horizontal swipe drives carousel, vertical swipe drives page scroll.
  useDirectionalScroll(scrollerRef as React.RefObject<HTMLElement | null>);

  // Track active slide from scroll position.
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

  // Auto-advance when not interacting.
  React.useEffect(() => {
    if (isInteracting || banners.length <= 1) return;
    const t = window.setInterval(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const next = (active + 1) % banners.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    }, AUTOPLAY_MS);
    return () => window.clearInterval(t);
  }, [active, banners.length, isInteracting]);

  const goTo = (idx: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    setIsInteracting(true);
  };

  const handlePointerUp = (e: React.PointerEvent, ctaHref: string) => {
    setIsInteracting(false);
    if (!dragStartRef.current) return;
    const dx = Math.abs(e.clientX - dragStartRef.current.x);
    const dy = Math.abs(e.clientY - dragStartRef.current.y);
    dragStartRef.current = null;

    // Only treat as a tap if no meaningful drag occurred
    if (dx < 10 && dy < 10) {
      void HapticService.selection();
      void navigate({ to: ctaHref });
    }
  };

  if (banners.length === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Promotional banners"
      className={cn("relative w-full select-none", className)}
      onPointerEnter={() => setIsInteracting(true)}
      onPointerLeave={() => setIsInteracting(false)}
    >
      <div
        ref={scrollerRef}
        className="flex w-full overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth touch-pan-y overscroll-x-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {banners.map((b) => (
          <div
            key={b.id}
            className="w-full shrink-0 px-4 snap-center cursor-pointer"
            onPointerDown={handlePointerDown}
            onPointerUp={(e) => handlePointerUp(e, b.ctaHref)}
          >
            <div
              role="group"
              aria-roledescription="slide"
              aria-label={`${b.title}. ${b.subtitle}. ${b.ctaLabel}`}
              className={cn(
                "relative flex w-full min-h-[160px] items-center justify-between gap-4 overflow-hidden rounded-2xl p-4 text-left shadow-medium transition-transform duration-200 active:scale-[0.99]",
                b.gradient || "bg-gradient-to-br from-[#0E4825] to-[#1B5934] text-white",
              )}
            >
              {/* Ambient lighting */}
              <div className="absolute inset-0 bg-black/10 mix-blend-overlay pointer-events-none" />

              <div className="relative min-w-0 flex-1 z-10">
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/30 backdrop-blur-sm text-[10px] font-extrabold uppercase tracking-wider text-amber-300 border border-white/10">
                  <span>BURG50</span>
                  <span>•</span>
                  <span>50% OFF</span>
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
          </div>
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
