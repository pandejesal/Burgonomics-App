/**
 * One-time HTTP auth wiring (called from the root bootstrap effect).
 *
 * The interceptor registry on `httpClient` was built for exactly this but
 * nothing ever registered: tokens were never attached and 401s never
 * retried. This closes that gap centrally so the first httpClient-backed
 * repository call is authenticated from day one.
 *
 * - Request: injects a FRESH Firebase ID token per request (never the
 *   15-minute store copy, which may have expired mid-session).
 * - Error: on 401, force-refreshes the Firebase token once and retries.
 */
import { auth } from "@/core/config/firebase";
import { httpClient } from "./httpClient";

let wired = false;

export function setupHttpAuth(): void {
  if (wired) return;
  wired = true;

  httpClient.useRequest(async (req) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (token) {
        return { ...req, headers: { ...req.headers, authorization: `Bearer ${token}` } };
      }
    } catch {
      // Offline / token fetch failed — send unauthenticated, let 401 handle it.
    }
    return req;
  });

  httpClient.useError(async (err, req) => {
    if (!err || (err as { status?: unknown }).status !== 401) throw err;
    if ((req.meta as Record<string, unknown> | undefined)?.__authRetried) throw err;
    const user = auth.currentUser;
    if (!user) throw err;
    const token = await user.getIdToken(true);
    return httpClient.request({
      ...req,
      meta: { ...req.meta, __authRetried: true },
      headers: { ...req.headers, authorization: `Bearer ${token}` },
    });
  });
}
