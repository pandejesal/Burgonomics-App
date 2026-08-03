/**
 * Core barrel. Prefer importing from `@/core/<domain>` (e.g.
 * `@/core/network`) in feature code — this root barrel exists for
 * tooling that expects a single package entry point.
 */
export * as config from "./config";
export * as network from "./network";
export * as errors from "./errors";
export * as storage from "./storage";
export * as state from "./state";
export * as models from "./models";
export * as dto from "./dto";
export * as mappers from "./mappers";
export * as types from "./types";
export * as constants from "./constants";
export * as utils from "./utils";
export * as logging from "./logging";
export * as analytics from "./analytics";
export * as featureFlags from "./featureFlags";
export * as integrations from "./integrations";
export * as repositories from "./repositories";
