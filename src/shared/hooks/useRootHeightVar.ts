import * as React from "react";

type RootHeightVar = `--${string}`;

/**
 * Publishes an element's measured border-box height as a CSS custom property on
 * `<html>` for as long as that element is attached, and removes exactly that
 * property when it detaches.
 *
 * Why this exists: the document scroller's `scroll-padding-*` is how a browser
 * keeps a Tab-focused control out from under fixed/sticky chrome (WCAG 2.2
 * SC 2.4.11). Those heights are layout facts, not constants: the partner header
 * wraps at 200% text and the customer menu rail changes with the view toggle, so
 * a hard-coded padding reserves the wrong band and the control still lands
 * behind the bar. Each chrome owner publishes what it actually measures.
 *
 * Deliberately narrow: it only ever writes its own property, so several owners
 * (top bar, menu rail, floating cart bar) can publish independently without
 * clobbering each other's root styles. If layout has not happened yet the
 * height is 0, and nothing is published — a stale value from a previous route
 * would reserve space that is no longer covered.
 *
 * The callback-ref shape (rather than a mount-only effect) matters for the same
 * reason it does in `cart.tsx`: chrome mounts conditionally, and React calls a
 * ref with `null` when the node leaves. That makes attach/cleanup follow the
 * node's real lifecycle.
 */
export function useRootHeightVar(name: RootHeightVar, enabled = true) {
  const cleanup = React.useRef<(() => void) | null>(null);

  const ref = React.useCallback(
    (node: HTMLElement | null) => {
      // Release whatever the previous node owned before deciding about this one.
      cleanup.current?.();
      cleanup.current = null;

      if (!node || !enabled || typeof document === "undefined") return;

      const root = document.documentElement;
      let attached = true;
      const apply = () => {
        if (!attached) return;
        // offsetHeight includes padding/borders but ignores motion's scale
        // transform. ResizeObserver does not report transform-only changes.
        const height = node.offsetHeight;
        if (!Number.isFinite(height) || height <= 0) {
          root.style.removeProperty(name);
          return;
        }
        root.style.setProperty(name, `${height}px`);
      };
      const release = () => root.style.removeProperty(name);

      apply();

      let observer: ResizeObserver | null = null;
      const onResize = () => apply();
      if (typeof ResizeObserver === "function") {
        observer = new ResizeObserver(onResize);
        observer.observe(node);
      } else if (typeof window !== "undefined") {
        // Older engines: a viewport resize is the only reflow signal available.
        window.addEventListener("resize", onResize);
      }

      cleanup.current = () => {
        attached = false;
        observer?.disconnect();
        if (!observer && typeof window !== "undefined") {
          window.removeEventListener("resize", onResize);
        }
        release();
      };
    },
    [name, enabled],
  );

  React.useEffect(() => () => cleanup.current?.(), []);

  return ref;
}
