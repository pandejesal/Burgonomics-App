import { appConfig } from "@/core/config/env";
import type { PetpoojaGateway } from "./types";
import { HttpPetpoojaGateway } from "./httpGateway";

/**
 * Gateway factory — the ONE place that creates the Petpooja gateway.
 *
 *   VITE_PETPOOJA_ENABLED=true  → HttpPetpoojaGateway ("live": Cloud
 *                                  Functions proxy + server-held key)
 *   anything else (default)     → THROWS (fail-closed, no mock fallback)
 *
 * Going live = set the flag, add PETPOOJA_APP_KEY / APP_SECRET /
 * ACCESS_TOKEN to the Functions env, redeploy functions + client.
 * No code changes, no consumer edits (same PetpoojaGateway interface).
 */
export function createPetpoojaGateway(): PetpoojaGateway {
  if (appConfig.integrations.petpoojaEnabled) {
    return new HttpPetpoojaGateway();
  }
  throw new Error(
    "[Petpooja] VITE_PETPOOJA_ENABLED is not set to true — refusing to start with mock gateway. " +
    "Set VITE_PETPOOJA_ENABLED=true and provide PETPOOJA_APP_KEY, PETPOOJA_APP_SECRET, PETPOOJA_ACCESS_TOKEN to go live."
  );
}

/** Shared singleton — import this, never instantiate gateways directly. */
export const petpoojaGateway: PetpoojaGateway = createPetpoojaGateway();

if (typeof console !== "undefined") {
  console.info(`[petpooja] gateway implementation: ${petpoojaGateway.implementation}`);
}
