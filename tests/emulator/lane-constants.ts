/**
 * EMULATOR TEST LANE — constants with zero imports.
 *
 * Imported by both the browser connector and `vite.emulator.config.ts`. Keeping
 * it dependency-free means Vite's config loader never has to resolve the app
 * alias (`@/...`) or bundle Firebase just to read the fixed lane target.
 */
export const EMULATOR_PROJECT_ID = "demo-burgonomics-emulator";
export const EMULATOR_FIRESTORE_HOST = "127.0.0.1";
export const EMULATOR_FIRESTORE_PORT = 8099;
export const EMULATOR_LABEL = "EMULATOR TEST — synthetic data, not live";
export const EMULATOR_LANE_MARKER = "__EMULATOR_LANE__";
