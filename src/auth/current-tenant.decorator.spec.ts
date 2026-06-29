import { TenantGuard } from './guards';
import type { ExecutionContext } from '@nestjs/common';

function ctxWithHeaders(headers: Record<string, string>): ExecutionContext {
  const req: any = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('TenantGuard (phase-3 stub)', () => {
  it('populates request.tenant from headers and allows', () => {
    const guard = new TenantGuard();
    const ctx = ctxWithHeaders({ 'x-tenant-id': 't1', 'x-user-id': 'u1' });
    const req: any = ctx.switchToHttp().getRequest();
    expect(guard.canActivate(ctx)).toBe(true);
    expect(req.tenant).toEqual({ tenantId: 't1', userId: 'u1' });
  });

  it('throws Unauthorized when x-tenant-id is missing', () => {
    const guard = new TenantGuard();
    const ctx = ctxWithHeaders({ 'x-user-id': 'u1' });
    expect(() => guard.canActivate(ctx)).toThrow();
  });
});