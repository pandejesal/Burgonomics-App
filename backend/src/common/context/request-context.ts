import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestContext } from '@common/interfaces';

/**
 * AsyncLocalStorage-backed per-request context. Populated by
 * `CorrelationIdMiddleware`; consumed anywhere in the request lifecycle
 * without prop-drilling.
 */
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}
