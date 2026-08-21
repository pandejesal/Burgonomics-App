import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { Banner } from "@/features/home/models";
import { SafeImage } from "@/shared/components/common/SafeImage";

const AUTOPLAY_MS = 5000;

interface Props {
  banners: Banner[];
  className?: string;
}

/**
 * Promotional banner carousel. Native horizontal scroll-snap for
 * momentum-friendly swipe on touch devices; auto-advances while the
 * user is not interacting; pauses on pointer/keyboard focus.
 */
export function BannerCarousel({ banners, className }: Props) {
  const navigate = useNavigate();
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const [active, setActive] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

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

  // Auto-advance.
  React.useEffect(() => {
    if (paused || banners.length <= 1) return;
    const t = window.setInterval(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const next = (active + 1) % banners.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    }, AUTOPLAY_MS);
    return () => window.clearInterval(t);
  }, [active, banners.length, paused]);

  const goTo = (idx: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
  };

  if (banners.length === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Promotional banners"
      className={cn("relative", className)}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        ref={scrollerRef}
        className={cn(
          "flex overflow-x-auto scroll-smooth [touch-action:pan-x_pan-y] no-scrollbar",
        )}
      >
        {banners.map((b, idx) => (
          <button
            key={b.id}
            type="button"
            onClick={() => navigate({ to: b.ctaHref })}
            aria-label={`${b.title}. ${b.subtitle}. ${b.ctaLabel}`}
            aria-roledescription="slide"
            aria-hidden={idx !== active}
            className={cn(
              "relative w-full shrink-0 px-4",
              "focus-visible:outline-none",
            )}
          >
            <div
              className={cn(
                "relative flex min-h-[148px] items-center gap-4 overflow-hidden rounded-[var(--radius-large)]",
                "bg-gradient-to-br text-primary-foreground p-4 text-left",
                "shadow-[var(--shadow-medium)] transition-all duration-150 ease-out select-none",
                "active:scale-[0.97] active:opacity-85",
                b.gradient,
              )}
            >
              {/* Subtle ambient lighting inside the banner */}
              <div className="absolute inset-0 bg-black/10 mix-blend-overlay pointer-events-none" />

              <div className="relative min-w-0 flex-1 z-10">
                <p className="type-caption uppercase tracking-wider opacity-90">Featured</p>
                <h3 className="type-headline-medium mt-1 leading-tight">{b.title}</h3>
                <p className="type-body-medium mt-1 line-clamp-2 opacity-95">{b.subtitle}</p>
                <span className="mt-3 inline-flex items-center rounded-full bg-white/20 px-3 py-1 type-label-large backdrop-blur">
                  {b.ctaLabel} →
                </span>
              </div>

              {b.imageUrl ? (
                <div className="relative z-10 h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-white/20 shadow-xl bg-neutral-900">
                  <SafeImage
                    src={b.imageUrl}
                    fallbackSrc={b.fallbackImageUrl}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                  />
                </div>
              ) : (
                <div
                  aria-hidden
                  className="grid h-24 w-24 shrink-0 place-items-center rounded-full bg-white/15 text-5xl backdrop-blur"
                >
                  {b.visual}
                </div>
              )}
            </div>
          </button>
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
                  ? "w-6 bg-primary"
                  : "w-1.5 bg-text-disabled/50 hover:bg-text-secondary",
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}
