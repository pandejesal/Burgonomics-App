import type {
  NotificationSyncErrorCode,
  NotificationSyncStatus,
} from "@/features/settings/models";

export interface PushStatusSnapshot {
  enabled: boolean;
  permission: "granted" | "denied" | "default" | "unsupported";
  listenerAttached: boolean;
}

/** True when the saved preference cannot currently produce an OS notification. */
export function isPushUnavailable(status: PushStatusSnapshot): boolean {
  if (!status.enabled) return false;
  if (status.permission === "denied" || status.permission === "unsupported") return true;
  return status.permission === "granted" && !status.listenerAttached;
}

/** Honest explanation for the blocked/unavailable case; null while undecided. */
export function pushUnavailableMessage(status: PushStatusSnapshot): string | null {
  if (!status.enabled) return null;
  if (status.permission === "denied") {
    return "Notifications are blocked in your device or browser settings. Turn them back on there to receive alerts.";
  }
  if (status.permission === "unsupported") {
    return "This browser can't show notifications, so alerts won't appear on this device.";
  }
  if (status.permission === "granted" && !status.listenerAttached) {
    return "Notifications aren't connected on this device yet. Reopen the app to retry.";
  }
  return null;
}

interface NotificationSyncNoticeProps {
  status: NotificationSyncStatus;
  errorCode: NotificationSyncErrorCode | null;
  canAdoptServer: boolean;
  pushUnavailable: boolean;
  pushUnavailableMessage: string | null;
  usingDefaults: boolean;
  onRetry: () => void;
  onAdoptServer: () => void;
}

/**
 * Honest save state. "Saved to your account" is rendered only after a real
 * server acknowledgement AND only when the device can actually display
 * notifications. Offline/5xx stays "pending", a 409 stays "conflict", and a
 * route/schema mismatch stays a terminal error instead of retrying forever.
 */
export function NotificationSyncNotice({
  status,
  errorCode,
  canAdoptServer,
  pushUnavailable,
  pushUnavailableMessage: blockedMessage,
  usingDefaults,
  onRetry,
  onAdoptServer,
}: NotificationSyncNoticeProps) {
  if (status === "conflict") {
    return (
      <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
        <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
          Another device changed these settings.
        </p>
        <p className="text-[11px] text-text-secondary leading-tight">
          Your latest changes aren&apos;t saved yet. Keep this device&apos;s choices or
          use the other device&apos;s version.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="min-h-[36px] px-3 py-1 rounded-xl bg-primary text-primary-foreground text-[11px] font-bold cursor-pointer"
          >
            Keep mine
          </button>
          {canAdoptServer && (
            <button
              type="button"
              onClick={onAdoptServer}
              className="min-h-[36px] px-3 py-1 rounded-xl bg-bg-secondary border border-divider text-text text-[11px] font-bold cursor-pointer"
            >
              Use other device
            </button>
          )}
        </div>
      </div>
    );
  }

  if (status === "error") {
    const copy =
      errorCode === "unauthenticated"
        ? "Sign in again to save these settings to your account."
        : errorCode === "forbidden"
          ? "This account can't change notification settings."
          : errorCode === "not_found"
            ? "Notification settings aren't available on this app build. Your choices are stored on this device."
            : errorCode === "bad_request"
              ? "We couldn't save these settings. Please update the app or try again."
              : errorCode === "invalid_response"
                ? "The server returned an unexpected response. Your choices are stored on this device."
                : "We couldn't save these settings yet.";
    return (
      <p role="alert" className="text-[11px] font-medium text-red-500">
        {copy}
      </p>
    );
  }

  if (status === "pending") {
    return (
      <p role="status" className="text-[11px] text-text-secondary">
        {errorCode === "offline"
          ? "Saved on this device. We'll sync when you're back online."
          : "Not saved to your account yet. We'll retry on the next launch."}
      </p>
    );
  }

  if (status === "synced" || status === "idle") {
    if (usingDefaults) {
      return (
        <p role="status" className="text-[11px] text-text-secondary">
          Using default notification settings.
        </p>
      );
    }
  }

  if (status === "synced") {
    if (pushUnavailable) {
      return (
        <p role="status" className="text-[11px] text-amber-700 dark:text-amber-300">
          {blockedMessage ?? "Preferences saved, but notifications are unavailable on this device."}
        </p>
      );
    }
    return (
      <p role="status" className="text-[11px] text-emerald-600 dark:text-emerald-400">
        Saved to your account.
      </p>
    );
  }

  return (
    <p className="text-[11px] text-text-secondary">
      Stored on this device for your account.
    </p>
  );
}

export function NotificationPushStatusNotice({ status }: { status: PushStatusSnapshot }) {
  const message = pushUnavailableMessage(status);
  if (!message) return null;
  return (
    <p role="status" className="text-[11px] text-amber-700 dark:text-amber-300">
      {message}
    </p>
  );
}
