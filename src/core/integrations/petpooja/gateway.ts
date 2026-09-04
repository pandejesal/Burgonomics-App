import { appConfig } from "@/core/config/env";
import type { PetpoojaGateway } from "./types";
import { HttpPetpoojaGateway } from "./httpGateway";
import { MockPetpoojaGateway } from "./mockGateway";

/**
 * Gateway factory — the ONE place that decides mock vs live Petpooja.
 *
 *   VITE_PETPOOJA_ENABLED=true  → HttpPetpoojaGateway ("live": Cloud
 *                                  Functions proxy + server-held key)
 *   anything else (default)     → MockPetpoojaGateway ("mock": current
 *                                  offline/demo behavior, unchanged)
 *
 * Going live = set the flag, add PETPOOJA_APP_KEY / APP_SECRET /
 * ACCESS_TOKEN to the Functions env, redeploy functions + client.
 * No code changes, no consumer edits (same PetpoojaGateway interface).
 */
export function createPetpoojaGateway(): PetpoojaGateway {
  if (appConfig.integrations.petpoojaEnabled) {
    return new HttpPetpoojaGateway();
  }
  return new MockPetpoojaGateway();
}

/** Shared singleton — import this, never instantiate gateways directly. */
export const petpoojaGateway: PetpoojaGateway = createPetpoojaGateway();

if (typeof console !== "undefined") {
  console.info(`[petpooja] gateway implementation: ${petpoojaGateway.implementation}`);
}
