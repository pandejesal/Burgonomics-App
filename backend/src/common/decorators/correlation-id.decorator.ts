import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CORRELATION_ID_HEADER } from '@common/constants';

export const CorrelationId = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return req.headers?.[CORRELATION_ID_HEADER];
});
