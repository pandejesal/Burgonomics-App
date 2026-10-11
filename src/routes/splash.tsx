import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { APP } from "@/core/constants/app";
import { BrandMascot, BrandWordmark } from "@/shared/components/common/BrandMascot";

export const Route = createFileRoute("/splash")({
  head: () => ({
    meta: [
      { title: `${APP.name} — ${APP.tagline}` },
      { property: "og:title", content: `${APP.name} — ${APP.tagline}` },
    ],
  }),
  component: SplashPage,
});

const SPLASH_HOLD_MS = 1500;

function SplashPage() {
  const navigate = useNavigate();
  const reduceMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  React.useEffect(() => {
    const t = window.setTimeout(() => {
      void navigate({ to: "/home", replace: true });
    }, SPLASH_HOLD_MS);
    return () => window.clearTimeout(t);
  }, [navigate]);

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-[#023020] px-6 text-center"
      role="status"
      aria-label={`${APP.name} loading`}
    >
      <BrandMascot size={160} float={!reduceMotion} />
      <BrandWordmark />
      <span className="type-caption uppercase tracking-widest text-primary-foreground/70">
        {APP.vegPromise}
      </span>
    </div>
  );
}
