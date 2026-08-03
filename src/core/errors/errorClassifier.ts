import {
  WifiOff,
  CloudOff,
  ShieldAlert,
  ServerCrash,
  AlertTriangle,
  RefreshCw,
  LucideIcon,
} from "lucide-react";

export type ErrorCategory =
  | "FIREBASE_NETWORK"
  | "FIREBASE_PERMISSION"
  | "API_CONNECTION"
  | "SERVER_ERROR"
  | "OFFLINE"
  | "APPLICATION_ERROR";

export interface ClassifiedErrorDetails {
  category: ErrorCategory;
  badgeLabel: string;
  badgeColor: string;
  title: string;
  description: string;
  suggestion: string;
  Icon: LucideIcon;
  isRetryable: boolean;
  errorCode?: string;
  originalMessage: string;
  technicalDetails?: string;
}

/**
 * Parses and classifies an error object (including Firebase, API, fetch, and standard JS runtime errors)
 * into a structured, UI-friendly display model.
 */
export function classifyError(error: unknown): ClassifiedErrorDetails {
  const isBrowserOffline = typeof navigator !== "undefined" && !navigator.onLine;

  const errObj = error as Record<string, unknown> | null | undefined;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : errObj?.message
          ? String(errObj.message)
          : "An unexpected error occurred.";

  const code =
    typeof errObj?.code === "string"
      ? errObj.code
      : typeof errObj?.status === "number" || typeof errObj?.status === "string"
        ? `HTTP ${errObj.status}`
        : undefined;

  const stack = error instanceof Error ? error.stack : undefined;
  const errorName = error instanceof Error ? error.name : "";

  // 1. Browser is completely offline
  if (isBrowserOffline || (message.includes("Failed to fetch") && isBrowserOffline)) {
    return {
      category: "OFFLINE",
      badgeLabel: "Network Offline",
      badgeColor: "bg-amber-500/10 text-amber-600 border-amber-500/20",
      title: "You're Currently Offline",
      description:
        "It looks like your internet connection was interrupted. Please verify your Wi-Fi or mobile network connection.",
      suggestion: "Reconnect to the internet and click retry to reload your session.",
      Icon: WifiOff,
      isRetryable: true,
      errorCode: "NET_OFFLINE",
      originalMessage: message,
      technicalDetails: stack || message,
    };
  }

  // 2. Firebase Network & Availability Errors
  const isFirebaseNetwork =
    code?.startsWith("auth/network-request-failed") ||
    code?.startsWith("auth/internal-error") ||
    code === "unavailable" ||
    code === "deadline-exceeded" ||
    code === "failed-precondition" ||
    message.toLowerCase().includes("network-request-failed") ||
    message.toLowerCase().includes("failed to connect to firebase") ||
    (message.toLowerCase().includes("firestore") && message.toLowerCase().includes("offline")) ||
    (message.toLowerCase().includes("firebase") && message.toLowerCase().includes("network"));

  if (isFirebaseNetwork) {
    return {
      category: "FIREBASE_NETWORK",
      badgeLabel: "Firebase Service",
      badgeColor: "bg-orange-500/10 text-orange-600 border-orange-500/20",
      title: "Firebase Connection Interrupted",
      description:
        "We're having difficulty communicating with Firebase authentication and database services. This is usually temporary.",
      suggestion: "Check your network stability or wait a few seconds before retrying.",
      Icon: CloudOff,
      isRetryable: true,
      errorCode: code || "FIREBASE_NET_ERR",
      originalMessage: message,
      technicalDetails: `Firebase Code: ${code || "N/A"}\nMessage: ${message}\n${stack || ""}`,
    };
  }

  // 3. Firebase Permission & Authentication Errors
  const isFirebasePermission =
    code === "permission-denied" ||
    code === "PERMISSION_DENIED" ||
    code?.startsWith("auth/unauthorized-domain") ||
    code?.startsWith("auth/operation-not-allowed") ||
    code?.startsWith("auth/requires-recent-login") ||
    code?.startsWith("auth/user-disabled") ||
    message.toLowerCase().includes("permission-denied") ||
    message.toLowerCase().includes("insufficient permissions") ||
    message.toLowerCase().includes("missing or insufficient permissions");

  if (isFirebasePermission) {
    return {
      category: "FIREBASE_PERMISSION",
      badgeLabel: "Firebase Auth",
      badgeColor: "bg-red-500/10 text-red-600 border-red-500/20",
      title: "Firebase Access Denied",
      description:
        "Your account session or security rules do not grant permission to perform this action or access this data.",
      suggestion:
        "Try signing out and signing back in, or contact support if you believe this is an error.",
      Icon: ShieldAlert,
      isRetryable: false,
      errorCode: code || "FIREBASE_PERM_ERR",
      originalMessage: message,
      technicalDetails: `Firebase Code: ${code || "permission-denied"}\nMessage: ${message}`,
    };
  }

  // 4. API & Generic Network Connection Issues (Fetch, Axios, CORS, server endpoint down)
  const isApiConnection =
    errorName === "NetworkError" ||
    (errorName === "TypeError" && message.includes("Failed to fetch")) ||
    message.includes("ERR_CONNECTION_REFUSED") ||
    message.includes("ERR_INTERNET_DISCONNECTED") ||
    message.includes("ERR_NAME_NOT_RESOLVED") ||
    message.includes("Network request failed") ||
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("ECONNREFUSED") ||
    message.includes("Load failed") ||
    message.toLowerCase().includes("cors");

  if (isApiConnection) {
    return {
      category: "API_CONNECTION",
      badgeLabel: "API Connectivity",
      badgeColor: "bg-blue-500/10 text-blue-600 border-blue-500/20",
      title: "Unable to Reach Server API",
      description:
        "Our connection to the backend server API was interrupted or blocked. The service might be starting up or temporarily unreachable.",
      suggestion: "Click retry below to establish a fresh connection with our servers.",
      Icon: RefreshCw,
      isRetryable: true,
      errorCode: code || "API_NET_ERR",
      originalMessage: message,
      technicalDetails: `Error: ${errorName}\nMessage: ${message}\n${stack || ""}`,
    };
  }

  // 5. Server Errors (5xx status codes)
  const isServerError =
    code?.startsWith("HTTP 5") ||
    (typeof errObj?.status === "number" && errObj.status >= 500) ||
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504");

  if (isServerError) {
    return {
      category: "SERVER_ERROR",
      badgeLabel: "Server Error",
      badgeColor: "bg-purple-500/10 text-purple-600 border-purple-500/20",
      title: "Backend Service Unavailable",
      description:
        "Our servers encountered an internal error or maintenance window while processing your request.",
      suggestion: "Please try again in a moment. Our engineering team has been alerted.",
      Icon: ServerCrash,
      isRetryable: true,
      errorCode: code || "HTTP_5XX",
      originalMessage: message,
      technicalDetails: `Server Status: ${code || "500"}\nMessage: ${message}\n${stack || ""}`,
    };
  }

  // 6. Generic Application / Render Error
  return {
    category: "APPLICATION_ERROR",
    badgeLabel: "System Exception",
    badgeColor: "bg-gray-500/10 text-gray-700 border-gray-500/20 dark:text-gray-300",
    title: "Something Got a Little Crispy",
    description:
      "An unexpected application error occurred while rendering this page or processing data.",
    suggestion: "Try reloading the section or returning to the home page.",
    Icon: AlertTriangle,
    isRetryable: true,
    errorCode: code || "APP_RENDER_ERR",
    originalMessage: message,
    technicalDetails: `Error Type: ${errorName || "Error"}\nMessage: ${message}\n${stack || ""}`,
  };
}
