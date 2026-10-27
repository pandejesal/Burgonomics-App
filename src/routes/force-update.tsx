import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/shared/layouts/AppShell";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { appConfig } from "@/core/config/env";

// Placeholder — Please update to continue.
export const Route = createFileRoute("/force-update")({
  head: () => ({
    meta: [
      { title: "Update required — Burgonomics" },
      { name: "description", content: "Please update to continue." },
    ],
  }),
  component: Page,
});

export interface ForceUpdateAction {
  kind: "store" | "support";
  label: string;
  url?: string;
}

function officialStoreUrl(raw: string, platform: "android" | "ios"): string | null {
  if (!raw.trim()) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();

    if (platform === "android") {
      if (host !== "play.google.com") return null;
      if (!url.pathname.startsWith("/store/apps/details")) return null;
      const packageId = url.searchParams.get("id") ?? "";
      if (!/^[A-Za-z0-9._]+$/.test(packageId)) return null;
      return url.toString();
    }

    if (host !== "apps.apple.com" && host !== "itunes.apple.com") return null;
    if (!url.pathname.includes("/app/") || !/\/id\d+/.test(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isIosUserAgent(userAgent: string): boolean {
  return /iPad|iPhone|iPod/i.test(userAgent);
}

/**
 * Resolves only a configured, official listing URL. No package id, market://
 * scheme, or unknown host is ever fabricated. With no verified listing the
 * action is the real support route, so the screen is never a dead end.
 */
export function resolveForceUpdateAction(
  androidStoreUrl: string = appConfig.integrations.androidStoreUrl,
  iosStoreUrl: string = appConfig.integrations.iosStoreUrl,
  userAgent: string = typeof navigator === "undefined" ? "" : navigator.userAgent,
): ForceUpdateAction {
  const ios = officialStoreUrl(iosStoreUrl, "ios");
  const android = officialStoreUrl(androidStoreUrl, "android");
  const url = isIosUserAgent(userAgent) ? ios ?? android : android ?? ios;
  if (url) return { kind: "store", label: "Open app store", url };
  return { kind: "support", label: "Contact support" };
}

function Page() {
  const navigate = useNavigate();
  const action = resolveForceUpdateAction();

  const handleAction = () => {
    if (action.kind === "store" && action.url) {
      window.open(action.url, "_blank", "noopener,noreferrer");
      return;
    }
    void navigate({ to: "/support" });
  };

  return (
    <AppShell showTabs={false} showTopBar={false}>
      <EmptyState
        title="A new version is available"
        description={
          action.kind === "store"
            ? "Please update Burgonomics to the latest version to continue ordering."
            : "Please update Burgonomics to the latest version. If you cannot update, contact our support team for help."
        }
        actionLabel={action.label}
        onAction={handleAction}
      />
    </AppShell>
  );
}
