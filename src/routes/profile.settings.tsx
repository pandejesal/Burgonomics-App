import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { AppShell } from "@/shared/layouts/AppShell";
import { ConfirmDialog } from "@/shared/components/common/ConfirmDialog";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/features/settings/state/settingsStore";
import { useNotificationPrefsStore } from "@/features/settings/state/notificationPrefsStore";
import { settingsRepository } from "@/features/settings/repositories/SettingsRepository";
import {
  NotificationPushStatusNotice,
  NotificationSyncNotice,
  isPushUnavailable,
  pushUnavailableMessage,
  type PushStatusSnapshot,
} from "@/features/settings/components/NotificationSyncNotice";
import {
  getPushStatusSnapshot,
  subscribePushStatus,
} from "@/shared/platform/pushNotifications";
import { profileRepository } from "@/features/profile/repositories/ProfileRepository";
import { toast } from "sonner";
import { APP } from "@/core/constants/app";

export const Route = createFileRoute("/profile/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Burgonomics" },
      { name: "description", content: "App preferences, theme toggle and privacy controls." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <ProtectedRoute>
      <Body />
    </ProtectedRoute>
  );
}

function Body() {
  const settings = useSettingsStore();
  const notificationPrefs = useNotificationPrefsStore();
  const [pushStatus, setPushStatus] = React.useState<PushStatusSnapshot>(getPushStatusSnapshot);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  // Permission can be changed in browser settings while this screen is open;
  // keep the blocked notice honest without polling.
  React.useEffect(() => {
    const refresh = () => setPushStatus(getPushStatusSnapshot());
    const unsubscribe = subscribePushStatus(refresh);
    window.addEventListener("focus", refresh);
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const pushUnavailable = isPushUnavailable(pushStatus);
  const pushNotice = pushUnavailableMessage(pushStatus);

  const requestDelete = async () => {
    setActionError(null);
    const res = await profileRepository.requestAccountDeletion();
    if (res.success) {
      toast.success("Account deleted. Order history anonymized, all personal data removed.");
      setTimeout(async () => {
        const { useAuthStore } = await import("@/features/auth/state/authStore");
        // The uid is erased server-side now, so its device-local caches are
        // purged as part of sign-out (F10) — not on ordinary logout.
        await useAuthStore.getState().logout({ purgeLocalCaches: true });
      }, 1000);
    } else {
      // Raw exception goes to the console only — never to the customer.
      console.error("Account deletion request failed:", res.error.message);
      setActionError("Couldn't delete your account. Please try again.");
    }
  };

  return (
    <AppShell title="Settings" backTo="/profile" showTabs showTopBar>
      <div className="mx-auto max-w-[520px] space-y-4 px-4 py-4">
        {/* Notification preferences — per account/device (C-01/C-04) */}
        <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-divider space-y-3 shadow-xs">
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Notification Preferences
          </h4>
          <p className="text-[11px] text-text-secondary leading-tight">
            These choices apply to this device and account only.
          </p>

          {notificationPrefs.legacyDecision === "pending" && (
            <div className="rounded-2xl border border-primary/30 bg-primary/[0.04] p-3 space-y-2">
              <p className="text-xs font-bold text-text">
                Keep your previous notification choices?
              </p>
              <p className="text-[11px] text-text-secondary leading-tight">
                Your old settings were saved before this device had an account. They
                won&apos;t be applied automatically. Keeping them separate is the
                default.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => notificationPrefs.declineLegacyPreferences()}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-[11px] font-bold cursor-pointer"
                >
                  Keep separate settings
                </button>
                <button
                  type="button"
                  onClick={() => void notificationPrefs.claimLegacyPreferences()}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-bg-secondary border border-divider text-text text-[11px] font-bold cursor-pointer"
                >
                  Use my old choices
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <ToggleRow
              label="Offers & promotions"
              description="Deals, combos and special limited drops."
              value={notificationPrefs.desired.offers}
              onChange={(v) => void settingsRepository.updateNotifications({ offers: v })}
            />
            <ToggleRow
              label="Order updates"
              description="Preparation, dispatch and live delivery tracking."
              value={notificationPrefs.desired.orderUpdates}
              onChange={(v) =>
                void settingsRepository.updateNotifications({ orderUpdates: v })
              }
            />
            <ToggleRow
              label="Announcements"
              description="Product launches and store news."
              value={notificationPrefs.desired.announcements}
              onChange={(v) =>
                void settingsRepository.updateNotifications({ announcements: v })
              }
            />
            <ToggleRow
              label="Support replies"
              description="Updates when our support team replies to your ticket."
              value={notificationPrefs.desired.supportReplies}
              onChange={(v) =>
                void settingsRepository.updateNotifications({ supportReplies: v })
              }
            />
          </div>

          <NotificationPushStatusNotice status={pushStatus} />

          <NotificationSyncNotice
            status={notificationPrefs.status}
            errorCode={notificationPrefs.errorCode}
            canAdoptServer={
              !!notificationPrefs.conflict?.currentPrefs &&
              notificationPrefs.conflict.currentVersion !== null
            }
            pushUnavailable={pushUnavailable}
            pushUnavailableMessage={pushNotice}
            usingDefaults={notificationPrefs.usingDefaults}
            onRetry={() => void notificationPrefs.retrySync()}
            onAdoptServer={() => notificationPrefs.adoptServerVersion()}
          />
        </div>

        {/* Appearance & theme */}
        <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-divider space-y-3 shadow-xs">
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Appearance
          </h4>
          <ToggleRow
            label="Dark mode"
            description="Enable high-contrast dark theme across Burgonomics."
            value={settings.theme === "dark"}
            onChange={(v) => {
              void settingsRepository.update({ theme: v ? "dark" : "light" });
            }}
          />
          <div className="pt-2 flex items-center justify-between border-t border-divider">
            <div>
              <p className="text-xs sm:text-sm font-bold text-text">Language</p>
              <p className="text-[11px] text-text-secondary">
                English (India)
              </p>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-bg-secondary text-text-secondary text-[10px] font-bold">
              Default
            </span>
          </div>
        </div>

        {/* Privacy */}
        <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-divider space-y-3 shadow-xs">
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Privacy & Analytics
          </h4>
          <ToggleRow
            label="Product analytics"
            description="Saved on this device only; no analytics data is currently collected or shared."
            value={settings.analyticsOptIn}
            onChange={(v) => void settingsRepository.update({ analyticsOptIn: v })}
          />
          <div className="pt-2 border-t border-divider">
            <ToggleRow
              label="Personalised recommendations"
              description="Saved on this device only; no personalisation data is currently collected or shared."
              value={settings.personalizedAdsOptIn}
              onChange={(v) => void settingsRepository.update({ personalizedAdsOptIn: v })}
            />
          </div>
        </div>

        {/* Danger zone */}
        <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-red-500/20 bg-red-500/5 space-y-2.5 shadow-xs">
          <h4 className="text-xs font-bold uppercase tracking-wider text-red-500">
            Danger Zone
          </h4>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-bold transition-colors cursor-pointer"
          >
            Delete account
          </button>
          <p className="text-[11px] text-text-secondary">
            Permanently deletes your account and removes personal profile data. Order records are anonymized for tax compliance.
          </p>
          {actionError && (
            <p role="alert" className="text-[11px] font-medium text-red-500">
              {actionError}
            </p>
          )}
        </div>

        <p className="text-[11px] text-text-secondary text-center">
          {APP.name} v{APP.version} • 100% Pure Vegetarian
        </p>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete your account?"
        description="This permanently deletes your account. Order history is anonymized; all other personal data is removed immediately. This cannot be undone."
        confirmLabel="Delete account"
        destructive
        onConfirm={() => void requestDelete()}
      />
    </AppShell>
  );
}

interface ToggleRowProps {
  label: string;
  description?: string;
  value: boolean;
  disabled?: boolean;
  trailing?: React.ReactNode;
  onChange: (v: boolean) => void;
}

function ToggleRow({ label, description, value, disabled, trailing, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-[44px]">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-xs sm:text-sm font-bold text-text">{label}</p>
        {description && (
          <p className="text-[11px] text-text-secondary leading-tight">
            {description}
          </p>
        )}
      </div>
      {trailing ?? (
        <Switch checked={value} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
      )}
    </div>
  );
}

export default Page;
