import * as React from "react";
import { Text } from "../common/Text";
import { AppButton } from "../common/AppButton";
import { BrandMascot } from "../common/BrandMascot";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Hide the branded mascot when a custom icon is preferred. */
  hideMascot?: boolean;
}

/**
 * Branded empty state — uses the BURGONOMICS mascot by default so
 * every empty surface reinforces the identity.
 */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  hideMascot,
}: EmptyStateProps) {
  return (
    <div role="status" className="flex flex-col items-center px-6 py-14 text-center">
      {icon ? (
        <div className="mb-5 grid h-20 w-20 place-items-center rounded-full bg-surface text-primary shadow-[var(--shadow-medium)]">
          {icon}
        </div>
      ) : hideMascot ? null : (
        <div className="mb-5">
          <BrandMascot size={140} float />
        </div>
      )}
      <Text variant="headlineMedium">{title}</Text>
      {description && (
        <Text variant="bodyMedium" tone="secondary" className="mt-2 w-full max-w-[22rem]">
          {description}
        </Text>
      )}
      {actionLabel && onAction && (
        <AppButton variant="primary" size="md" onClick={onAction} className="mt-6">
          {actionLabel}
        </AppButton>
      )}
    </div>
  );
}
