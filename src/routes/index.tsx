import { createFileRoute, Navigate } from "@tanstack/react-router";
import { APP } from "@/core/constants/app";

/**
 * Root route ('/') — redirects seamlessly to Home ('/home')
 */
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${APP.name} — ${APP.tagline}` },
      { property: "og:title", content: `${APP.name} — ${APP.tagline}` },
    ],
  }),
  component: () => <Navigate to="/home" replace />,
});
