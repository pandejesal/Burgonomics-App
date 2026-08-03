import * as React from "react";
import { AlertTriangle, WifiOff, Wrench } from "lucide-react";
import { AppButton } from "../common/AppButton";
import { Text } from "../common/Text";
import { messages, type AppErrorKind } from "@/core/errors/AppError";

interface FailureStateProps {
  kind?: AppErrorKind;
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function FailureState({ kind = "UNKNOWN", title, message, onRetry }: FailureStateProps) {
  const Icon = kind === "OFFLINE" ? WifiOff : kind === "MAINTENANCE" ? Wrench : AlertTriangle;

  return (
    <div role="alert" className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 grid h-16 w-16 place-items-center rounded-full bg-error/10 text-error">
        <Icon className="h-8 w-8" aria-hidden />
      </div>
      <Text variant="headlineMedium">{title ?? "Something went wrong"}</Text>
      <Text variant="bodyMedium" tone="secondary" className="mt-2 w-full max-w-[22rem]">
        {message ?? messages[kind]}
      </Text>
      {onRetry && (
        <AppButton variant="primary" size="md" onClick={onRetry} className="mt-6">
          Try again
        </AppButton>
      )}
    </div>
  );
}
