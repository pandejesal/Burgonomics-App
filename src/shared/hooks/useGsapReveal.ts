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
          y: options.yOffset ?? 20,
          opacity: 0,
          scale: 0.99,
        },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: options.duration ?? 0.4,
          stagger: options.stagger ?? 0.06,
          delay: options.delay ?? 0,
          ease: "power2.out",
          clearProps: "opacity,transform",
        },
      );
    }, el);

    return () => ctx.revert();
  }, [options.yOffset, options.duration, options.stagger, options.delay]);

  return ref;
}
