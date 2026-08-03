/**
 * Sanitizes a redirect URL to prevent Open Redirect vulnerabilities.
 * Ensures the target starts with a single `/` and does not attempt
 * to navigate to an external domain (e.g. `//evil.com` or `https://`).
 *
 * @param url The raw search parameter redirect URL
 * @param fallback The safe fallback route if validation fails
 */
export function sanitizeRedirectUrl(url: string | undefined | null, fallback = "/home"): string {
  if (!url || typeof url !== "string") return fallback;

  // Must start with exactly one slash, not two (//) or backslash (/\)
  if (url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\")) {
    return url;
  }

  return fallback;
}
