import { createFileRoute } from "@tanstack/react-router";
import { APP } from "@/core/constants/app";
import { SplashPage } from "./splash";

/**
 * Root route ('/') — branded splash first, then Home ('/home')
 */
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${APP.name} — ${APP.tagline}` },
      { property: "og:title", content: `${APP.name} — ${APP.tagline}` },
    ],
  }),
  component: SplashPage,
});
