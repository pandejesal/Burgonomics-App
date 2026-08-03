/**
 * Home feature barrel — the only entry point Home-related UI should
 * consume. Repositories are exported so composition code can swap the
 * mock implementation for the API variant without touching UI.
 */
export * from "./models";
export * from "./repositories/HomeRepository";
export { useHomeStore } from "./state/homeStore";
export type { HomeStatus } from "./state/homeStore";
export { greetingForHour } from "./utils/greeting";
