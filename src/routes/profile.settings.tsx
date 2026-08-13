import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Shield } from "lucide-react";

export const Route = createFileRoute("/profile/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Burgonomics" },
      { name: "description", content: "App preferences and account controls." },
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
      toast.success("Account deletion scheduled under DPDP. Signing out...");
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
        <AppCard padded>
          <Text variant="titleMedium" className="mb-2">
            Notification preferences
          </Text>
          <div className="space-y-3">
            <ToggleRow
              label="Offers & promotions"
              description="Deals, combos and special drops."
              value={settings.notifications.offers}
              onChange={(v) => void settingsRepository.updateNotifications({ offers: v })}
            />
            <ToggleRow
              label="Order updates"
              description="Preparation, dispatch and delivery status."
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
        </AppCard>

        {/* Appearance & language (placeholders) */}
        <AppCard padded>
          <Text variant="titleMedium" className="mb-2">
            Appearance
          </Text>
          <ToggleRow
            label="Dark mode"
            description="Enable dark theme across the application."
            value={settings.theme === "dark"}
            onChange={(v) => {
              void settingsRepository.update({ theme: v ? "dark" : "light" });
            }}
          />
          <div className="mt-3 flex items-center justify-between">
            <div>
              <Text variant="bodyLarge">Language</Text>
              <Text variant="caption" tone="secondary">
                English (India)
              </Text>
            </div>
            <AppBadge tone="neutral">Soon</AppBadge>
          </div>
        </AppCard>

        {/* Privacy */}
        <AppCard padded>
          <Text variant="titleMedium" className="mb-2">
            Privacy
          </Text>
          <ToggleRow
            label="Product analytics"
            description="Helps us improve the app. No personal data is sold."
            value={settings.analyticsOptIn}
            onChange={(v) => void settingsRepository.update({ analyticsOptIn: v })}
          />
          <div className="mt-3">
            <ToggleRow
              label="Personalised recommendations"
              description="Show offers based on your ordering history."
              value={settings.personalizedAdsOptIn}
              onChange={(v) => void settingsRepository.update({ personalizedAdsOptIn: v })}
            />
          </div>
        </AppCard>

        {/* Administrative Gateway */}
        <AppCard padded>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0E4825]/10 text-[#0E4825]">
              <Shield size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <Text variant="titleMedium" className="mb-1 text-[#0E4825] font-bold">
                Administrative Gateway
              </Text>
              <Text variant="caption" tone="secondary" className="mb-4 block leading-relaxed">
                Log in to the BURGONOMICS Mission Control and POS coordination console. Designed for
                system administrators, developers, and store managers.
              </Text>
              <Link
                to="/admin/login"
                className="inline-flex items-center justify-center rounded-xl bg-[#0E4825] px-4 py-2.5 text-xs font-bold text-white transition-all hover:bg-[#0B3A1D] hover:shadow-[0_4px_12px_rgba(14,72,37,0.15)] shadow-sm active:scale-95"
              >
                Launch Admin Portal
              </Link>
            </div>
          </div>
        </AppCard>

        {/* Danger zone */}
        <AppCard padded>
          <Text variant="titleMedium" tone="error" className="mb-2">
            Danger zone
          </Text>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="type-label-large text-error hover:underline"
          >
            Request account deletion
          </button>
          <Text variant="caption" tone="secondary" className="mt-1">
            We'll process your request within 30 days as required by law.
          </Text>
        </AppCard>

        <Text variant="caption" tone="secondary" className="text-center">
          {APP.name} v1.0.0
        </Text>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Request account deletion?"
        description="Your data will be scheduled for deletion. This cannot be undone once processed."
        confirmLabel="Request deletion"
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
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <Text variant="bodyLarge">{label}</Text>
        {description && (
          <Text variant="caption" tone="secondary">
            {description}
          </Text>
        )}
      </div>
      {trailing ?? (
        <Switch checked={value} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
      )}
    </div>
  );
}
