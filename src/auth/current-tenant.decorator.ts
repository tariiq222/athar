import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { TenantContext } from './guards';

export type { TenantContext } from './guards';

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const req = ctx.switchToHttp().getRequest();
    return req.tenant as TenantContext;
  },
);