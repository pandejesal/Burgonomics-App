import * as React from "react";

interface Options {
  yOffset?: number;
  duration?: number;
  stagger?: number;
}

/**
 * useGsapReveal — reveal-on-mount for the splash gate. Uses gsap when
 * available, falls back to a CSS transition; never throws when the
 * animation library is missing (splash must always advance).
 */
export function useGsapReveal({ yOffset = 60, duration = 1.2 }: Options = {}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    void (async () => {
      try {
        const gsapMod = await import("gsap");
        if (cancelled || !ref.current) return;
        const gsap = gsapMod.gsap ?? gsapMod.default;
        gsap.fromTo(
          ref.current,
          { y: yOffset, opacity: 0 },
          { y: 0, opacity: 1, duration, ease: "power3.out", overwrite: true },
        );
      } catch {
        if (cancelled || !ref.current) return;
        ref.current.style.transition = `opacity ${duration}s ease, transform ${duration}s ease`;
        ref.current.style.opacity = "1";
        ref.current.style.transform = "translateY(0)";
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [yOffset, duration]);

  return ref;
}
