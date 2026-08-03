import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthStore } from "@/features/auth/state/authStore";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { BrandMascot } from "@/shared/components/common/BrandMascot";
import { APP } from "@/core/constants/app";

/**
 * SCR-001 Splash / State Gate — BURGONOMICS branded.
 * Guest-first: waits for auth bootstrap + Zustand rehydration, then routes.
 */
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${APP.name} — ${APP.tagline}` },
      { property: "og:title", content: `${APP.name} — ${APP.tagline}` },
    ],
  }),
  component: Splash,
});

function Splash() {
  const navigate = useNavigate();
  const isBootstrapped = useAuthStore((s) => s.isBootstrapped);
  const isStoreHydrated = useStoreSelection((s) => s.isHydrated);

  useEffect(() => {
    if (!isBootstrapped || !isStoreHydrated) return;
    const t = setTimeout(() => {
      const s = useStoreSelection.getState();
      const ready = !!s.activeStore && !!s.fulfillment;
      void navigate({ to: ready ? "/home" : "/stores", replace: true });
    }, 600);
    return () => clearTimeout(t);
  }, [isBootstrapped, isStoreHydrated, navigate]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-brand-gradient px-6 text-primary-foreground"
    >
      {/* Ambient orange glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 h-[280px] w-[280px] -translate-x-1/2 translate-y-1/3 rounded-full bg-secondary/60 blur-3xl"
      />

      <div className="relative flex flex-col items-center gap-8 text-center">
        <BrandMascot size={180} float />
        <div className="flex flex-col items-center gap-2">
          <h1 className="type-display-large tracking-[0.12em] text-primary-foreground">
            {APP.name}
          </h1>
          <span className="h-px w-16 bg-accent" />
          <p className="type-title-medium uppercase tracking-[0.15em] text-accent font-bold">
            {APP.tagline}
          </p>
        </div>

        <div className="mt-4 flex items-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent [animation-delay:0ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent [animation-delay:150ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent [animation-delay:300ms]" />
          <span className="sr-only">Loading BURGONOMICS</span>
        </div>
      </div>
    </div>
  );
}
