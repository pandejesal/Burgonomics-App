import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function useGsapReveal(
  options: {
    yOffset?: number;
    duration?: number;
    stagger?: number;
    delay?: number;
  } = {},
) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // We only want to animate the immediate children
    const children = el.children;
    if (children.length === 0) return;

    // We use a context to clean up easily
    const ctx = gsap.context(() => {
      gsap.fromTo(
        children,
        {
          y: options.yOffset ?? 40,
          opacity: 0,
          rotateX: 5,
          scale: 0.98,
        },
        {
          y: 0,
          opacity: 1,
          rotateX: 0,
          scale: 1,
          duration: options.duration ?? 0.8,
          stagger: options.stagger ?? 0.1,
          delay: options.delay ?? 0,
          ease: "power3.out",
          scrollTrigger: {
            trigger: el,
            start: "top 90%", // Trigger when top of element hits 90% of viewport
            once: true,
          },
        },
      );
    }, el);

    return () => ctx.revert();
  }, [options.yOffset, options.duration, options.stagger, options.delay]);

  return ref;
}
