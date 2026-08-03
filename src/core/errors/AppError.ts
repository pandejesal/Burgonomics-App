export type AppErrorKind =
  | "NETWORK"
  | "OFFLINE"
  | "UNAUTHORIZED"
  | "MAINTENANCE"
  | "SESSION_EXPIRED"
  | "NOT_FOUND"
  | "UNKNOWN";

export interface AppError {
  kind: AppErrorKind;
  message: string;
  retryable: boolean;
}

export const toAppError = (err: unknown): AppError => {
  if (err && typeof err === "object" && "kind" in err) return err as AppError;
  const message = err instanceof Error ? err.message : "Something went wrong.";
  return { kind: "UNKNOWN", message, retryable: true };
};

export const messages: Record<AppErrorKind, string> = {
  NETWORK: "We couldn't reach our servers. Please try again.",
  OFFLINE: "You're offline. Showing cached content where available.",
  UNAUTHORIZED: "Please sign in again to continue.",
  MAINTENANCE: "We're performing scheduled maintenance. Please check back shortly.",
  SESSION_EXPIRED: "Your session expired. Please sign in again.",
  NOT_FOUND: "We couldn't find what you were looking for.",
  UNKNOWN: "Something went wrong. Please try again.",
};
