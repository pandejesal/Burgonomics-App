import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Monitor, Moon, Sun } from "lucide-react";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { AppShell } from "@/shared/layouts/AppShell";
import { ConfirmDialog } from "@/shared/components/common/ConfirmDialog";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/features/settings/state/settingsStore";
import { settingsRepository } from "@/features/settings/repositories/SettingsRepository";
import { profileRepository } from "@/features/profile/repositories/ProfileRepository";
import type { ThemePreference } from "@/features/settings/models";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { APP } from "@/core/constants/app";

export const Route = createFileRoute("/profile/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Burgonomics" },
      { name: "description", content: "App preferences, theme and privacy controls." },
    ],
  }),
  component: Page,
});

export function Page() {
  return (
    <ProtectedRoute>
      <Body />
    </ProtectedRoute>
  );
}

function Body() {
  const settings = useSettingsStore();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [themeError, setThemeError] = React.useState<string | null>(null);

  const requestDelete = async () => {
    setActionError(null);
    const res = await profileRepository.requestAccountDeletion();
    if (res.success) {
      toast.success("Account deleted. Order history anonymized, all personal data removed.");
      setTimeout(async () => {
        const { useAuthStore } = await import("@/features/auth/state/authStore");
        await useAuthStore.getState().logout();
      }, 1000);
    } else {
      // Raw exception goes to the console only — never to the customer.
      console.error("Account deletion request failed:", res.error.message);
      setActionError("Couldn't delete your account. Please try again.");
    }
  };

  const changeTheme = (theme: ThemePreference) => {
    setThemeError(null);
    void settingsRepository
      .update({ theme })
      .then((res) => {
        if (!res.success) {
          setThemeError("Couldn't save your appearance choice. Please try again.");
        }
      })
      .catch(() => {
        setThemeError("Couldn't save your appearance choice. Please try again.");
      });
  };

  return (
    <AppShell title="Settings" backTo="/profile" showTabs showTopBar>
      <div className="mx-auto max-w-[560px] space-y-5 px-4 py-5">
        {/* Appearance & theme */}
        <section
          aria-labelledby="appearance-heading"
          className="space-y-4 rounded-[var(--radius-large)] border border-divider bg-surface p-5 shadow-[var(--shadow-low)]"
        >
          <div className="space-y-1">
            <h2 id="appearance-heading" className="type-title-large text-text-primary">
              Appearance
            </h2>
            <p className="type-caption text-text-secondary">
              Choose how Burgonomics looks on this device.
            </p>
          </div>

          <ThemePreferenceControl value={settings.theme} onChange={changeTheme} />

          <p className="type-caption text-text-secondary">
            System follows your device setting and updates automatically.
          </p>

          {themeError && (
            <p
              role="alert"
              className="rounded-[var(--radius-medium)] border border-error/30 bg-error/5 px-3 py-2 type-caption font-medium text-error"
            >
              {themeError}
            </p>
          )}

          <div className="flex items-center justify-between gap-4 border-t border-divider pt-4">
            <div className="min-w-0 space-y-0.5">
              <p className="type-body-medium font-medium text-text-primary">Language</p>
              <p className="type-caption text-text-secondary">English (India)</p>
            </div>
            <span className="shrink-0 rounded-full bg-bg-secondary px-3 py-1 type-label-medium text-text-secondary">
              Default
            </span>
          </div>
        </section>

        {/* Notification preferences */}
        <section
          aria-labelledby="notifications-heading"
          className="space-y-4 rounded-[var(--radius-large)] border border-divider bg-surface p-5 shadow-[var(--shadow-low)]"
        >
          <div className="space-y-1">
            <h2 id="notifications-heading" className="type-title-large text-text-primary">
              Notifications
            </h2>
            <p className="type-caption text-text-secondary">
              Choose what updates you want to receive.
            </p>
          </div>
          <div className="space-y-1">
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
        </section>

        {/* Privacy */}
        <section
          aria-labelledby="privacy-heading"
          className="space-y-4 rounded-[var(--radius-large)] border border-divider bg-surface p-5 shadow-[var(--shadow-low)]"
        >
          <div className="space-y-1">
            <h2 id="privacy-heading" className="type-title-large text-text-primary">
              Privacy & Analytics
            </h2>
            <p className="type-caption text-text-secondary">
              Saved on this device only. You can change these choices at any time.
            </p>
          </div>
          <div className="space-y-1">
            <ToggleRow
              label="Product analytics"
              description="Saved on this device only; no analytics data is currently collected or shared."
              value={settings.analyticsOptIn}
              onChange={(v) => void settingsRepository.update({ analyticsOptIn: v })}
            />
            <ToggleRow
              label="Personalised recommendations"
              description="Saved on this device only; no personalisation data is currently collected or shared."
              value={settings.personalizedAdsOptIn}
              onChange={(v) => void settingsRepository.update({ personalizedAdsOptIn: v })}
            />
          </div>
        </section>

        {/* Danger zone */}
        <section
          aria-labelledby="danger-heading"
          className="space-y-3 rounded-[var(--radius-large)] border border-error/25 bg-error/5 p-5"
        >
          <h2 id="danger-heading" className="type-title-medium text-error">
            Delete account
          </h2>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="min-h-[44px] rounded-[var(--radius-medium)] border border-error/30 bg-error/10 px-4 py-2 type-button-sm text-error transition-colors hover:bg-error/15"
          >
            Delete account
          </button>
          <p className="type-caption text-text-secondary">
            Permanently deletes your account and removes personal profile data. Order records are
            anonymized for tax compliance.
          </p>
          {actionError && (
            <p
              role="alert"
              className="rounded-[var(--radius-medium)] border border-error/30 bg-surface px-3 py-2 type-caption font-medium text-error"
            >
              {actionError}
            </p>
          )}
        </section>

        <p className="type-caption text-center text-text-secondary">
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

interface ThemeOption {
  value: ThemePreference;
  label: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

const THEME_OPTIONS: readonly ThemeOption[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

export interface ThemePreferenceControlProps {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
  disabled?: boolean;
}

/**
 * Native radios keep the control keyboard operable and screen-reader
 * announceable without a hand-rolled roving tabindex. Each target is at least
 * 48px tall, above the 44px touch minimum.
 */
export function ThemePreferenceControl({ value, onChange, disabled }: ThemePreferenceControlProps) {
  const groupName = React.useId();

  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="sr-only">Theme</legend>
      <div className="grid grid-cols-3 gap-2">
        {THEME_OPTIONS.map(({ value: optionValue, label, Icon }) => {
          const selected = value === optionValue;
          return (
            <label key={optionValue} className="relative block min-h-[48px] cursor-pointer">
              <input
                type="radio"
                name={groupName}
                value={optionValue}
                checked={selected}
                onChange={() => onChange(optionValue)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "flex h-full min-h-[48px] flex-col items-center justify-center gap-1 rounded-[var(--radius-medium)] border border-border bg-surface px-2 py-2.5 type-label-large text-text-secondary transition-colors",
                  "peer-checked:border-2 peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:font-semibold peer-checked:text-primary-text",
                  "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
                  disabled && "opacity-50",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
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
    <div className="flex min-h-[52px] items-center justify-between gap-4 border-b border-divider/70 py-2 last:border-b-0">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="type-body-medium font-medium text-text-primary">{label}</p>
        {description && <p className="type-caption text-text-secondary">{description}</p>}
      </div>
      {trailing ?? (
        <Switch
          checked={value}
          onCheckedChange={onChange}
          disabled={disabled}
          aria-label={label}
          // Expand the 20px control to a 44px touch target and keep the
          // unchecked track at >= 3:1 against the canvas.
          className="relative after:absolute after:-inset-3 after:content-[''] data-[state=unchecked]:bg-text-secondary/70"
        />
      )}
    </div>
  );
}

export default Page;
