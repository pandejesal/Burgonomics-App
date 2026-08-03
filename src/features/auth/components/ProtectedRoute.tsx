import { type ReactNode } from "react";
import { useRequireAuth } from "@/features/auth/hooks/useAuthGuard";
import { FullScreenLoader } from "@/shared/components/feedback/Spinner";

/**
 * Wrap a protected route's body. Renders a loader until the auth
 * bootstrap completes; the underlying `useRequireAuth` hook handles
 * the redirect to `/auth/login?redirect=…` for unauthenticated users.
 *
 * Public and guest routes must NOT be wrapped in this component — see
 * `useAuthGuard.ts` for the three-tier route classification.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isBootstrapped, isAuthenticated } = useRequireAuth();
  if (!isBootstrapped || !isAuthenticated) {
    return <FullScreenLoader label="Loading" />;
  }
  return <>{children}</>;
}
