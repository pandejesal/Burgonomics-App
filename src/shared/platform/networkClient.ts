import type { NetworkPlugin } from "@capacitor/network";

/** The slice of the native Network plugin the connectivity hook uses. */
export type NativeNetworkClient = Pick<NetworkPlugin, "getStatus" | "addListener">;

/**
 * Load the installed native Network plugin.
 *
 * This is the only place the SDK module is reached, so tests can replace the
 * I/O boundary (how the client is obtained) instead of re-mocking the vendor
 * module registry. It performs no status calls and no fallback logic.
 */
export async function loadNativeNetworkClient(): Promise<NativeNetworkClient> {
  const { Network } = await import("@capacitor/network");
  return Network;
}
