import { getRequestContext } from '@common/context/request-context';

export function envelope<T>(data: T): {
  success: true;
  timestamp: string;
  correlationId: string | undefined;
  data: T;
} {
  return {
    success: true,
    timestamp: new Date().toISOString(),
    correlationId: getRequestContext()?.correlationId,
    data,
  };
}
