import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { AppShell } from "@/shared/layouts/AppShell";
import { AppCard } from "@/shared/components/common/AppCard";
import { Text } from "@/shared/components/common/Text";
import { AppBadge } from "@/shared/components/common/AppBadge";
import { ConfirmDialog } from "@/shared/components/common/ConfirmDialog";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/features/settings/state/settingsStore";
import { settingsRepository } from "@/features/settings/repositories/SettingsRepository";
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
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const requestDelete = async () => {
    const res = await profileRepository.requestAccountDeletion();
    if (res.success) {
      toast.success("Account deleted. Order history anonymized, all personal data removed.");
      setTimeout(async () => {
        const { useAuthStore } = await import("@/features/auth/state/authStore");
        await useAuthStore.getState().logout();
      }, 1000);
    } else {
      toast.error(res.error.message);
    }
  };

  return (
    <AppShell title="Settings" backTo="/profile" showTabs showTopBar>
      <div className="mx-auto max-w-[520px] space-y-4 px-4 py-4">
        {/* Notification preferences */}
        <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-divider space-y-3 shadow-xs">
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Notification Preferences
          </h4>
          <div className="space-y-3">
            <ToggleRow
              label="Offers & promotions"
              description="Deals, combos and special limited drops."
              value={settings.notifications.offers}
              onChange={(v) => void settingsRepository.updateNotifications({ offers: v })}
            />
            <ToggleRow
              label="Order updates"
              description="Preparation, dispatch and live delivery tracking."
              value={settings.notifications.orderUpdates}
              onChange={(v) => void settingsRepository.updateNotifications({ orderUpdates: v })}
            />
            <ToggleRow
              label="Announcements"
              description="Product launches and store news."
              value={settings.notifications.announcements}
              onChange={(v) => void settingsRepository.updateNotifications({ announcements: v })}
            />
          </div>
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
            description="Helps us optimize menu loading. No personal data is shared."
            value={settings.analyticsOptIn}
            onChange={(v) => void settingsRepository.update({ analyticsOptIn: v })}
          />
          <div className="pt-2 border-t border-divider">
            <ToggleRow
              label="Personalised recommendations"
              description="Suggest burgers and combos based on your taste profile."
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
        </div>

        <p className="text-[11px] text-text-secondary text-center">
          {APP.name} v1.0.0 • 100% Pure Vegetarian
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
