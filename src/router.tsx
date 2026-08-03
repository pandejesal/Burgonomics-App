import { QueryClient } from "@tanstack/react-query";
import { createRouter, createHashHistory, type ErrorComponentProps } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { isNative } from "@/shared/platform/platform";
import { FailureState } from "@/shared/components/feedback/FailureState";
import { AppShell } from "@/shared/layouts/AppShell";

const shouldUseHashHistory = () => {
  if (typeof window === "undefined") return false;
  if (import.meta.env.IS_CAPACITOR_BUILD === "true" || import.meta.env.IS_CAPACITOR_BUILD === true)
    return true;
  if (window.location.protocol === "file:" || window.location.pathname.includes("android_asset"))
    return true;
  return isNative();
};

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: shouldUseHashHistory() ? createHashHistory() : undefined,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    notFoundMode: "root",
    defaultErrorComponent: ({ error }: ErrorComponentProps) => {
      return (
        <AppShell title="Error" showTabs={true}>
          <FailureState
            title="Oops, something went wrong"
            message={
              error instanceof Error
                ? error.message
                : "An unexpected error occurred while loading this page."
            }
            onRetry={() => window.location.reload()}
          />
        </AppShell>
      );
    },
  });

  return router;
};
