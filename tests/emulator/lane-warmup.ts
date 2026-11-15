/**
 * EMULATOR TEST LANE — Playwright global setup: wait for Vite's dependency optimizer.
 *
 * Every lane run starts Vite with an empty per-run dependency cache. On a loaded
 * Windows host the cold scan and bundle took 40-80 s, longer than the cold-launch
 * test's unchanged 25 s route wait, so test 1 failed before any assertion ran.
 * Vite holds an optimized-dependency response until that bundle is ready, so
 * fetching the lane entry and one dependency it imports waits for exactly that.
 *
 * No browser, no test assertion and no non-loopback request: every URL must pass
 * the lane's exact-origin loopback policy.
 */
import { VITE_PORT, isLoopbackLaneUrl } from "./lane-url-policy";

const BASE_URL = `http://127.0.0.1:${VITE_PORT}`;
const ENTRY = "/tests/emulator/emulator-entry.tsx";
const WARMUP_TIMEOUT_MS = 240_000;
const MAX_ATTEMPTS = 5;

/** Resolves with the elapsed milliseconds once an optimized dependency is served. */
export async function warmUpVite(
  baseUrl: string,
  isAllowed: (url: string) => boolean,
  signal: AbortSignal = AbortSignal.timeout(WARMUP_TIMEOUT_MS),
): Promise<number> {
  const fetchAllowed = (url: string): Promise<Response> => {
    if (!isAllowed(url)) throw new Error(`[lane-warmup] refusing non-loopback URL ${url}`);
    // Only this URL was checked; a redirect could leave the loopback origin.
    return fetch(url, { signal, redirect: "error" });
  };
  const fetchText = async (url: string): Promise<string> => {
    const response = await fetchAllowed(url);
    if (!response.ok) throw new Error(`[lane-warmup] ${url} returned HTTP ${response.status}`);
    return response.text();
  };

  const started = Date.now();
  const html = await fetchText(`${baseUrl}/`);
  if (!html.includes(ENTRY)) {
    throw new Error("[lane-warmup] served index.html does not boot the lane entry");
  }
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const entry = await fetchText(`${baseUrl}${ENTRY}`);
    const dependency = entry.match(/["']([^"']*\/deps\/[^"']+\?v=[^"']+)["']/)?.[1];
    if (!dependency) throw new Error("[lane-warmup] lane entry imports no optimized dependency");
    const response = await fetchAllowed(new URL(dependency, baseUrl).href);
    await response.arrayBuffer();
    // 504 means the optimizer re-bundled after this entry was transformed; the
    // fresh entry carries the new version hash.
    if (response.status === 504) continue;
    if (!response.ok) throw new Error(`[lane-warmup] dependency returned HTTP ${response.status}`);
    return Date.now() - started;
  }
  throw new Error(`[lane-warmup] dependencies still outdated after ${MAX_ATTEMPTS} attempts`);
}

export default async function globalSetup(): Promise<void> {
  const elapsed = await warmUpVite(BASE_URL, isLoopbackLaneUrl);
  console.log(`[lane-warmup] Vite dependencies ready after ${elapsed} ms`);
}
