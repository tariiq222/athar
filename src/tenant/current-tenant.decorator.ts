import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContext } from './tenant-context';

export type { TenantContext } from './tenant-context';

// Reads the tenant scope ONLY from the verified request context — never from body/query.
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest<{ tenantContext: TenantContext }>();
    return request.tenantContext;
  },
);