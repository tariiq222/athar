import { ExecutionContext } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';

function ctx(tenantContext?: unknown) {
  const request: any = { tenantContext };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('TenantGuard', () => {
  const guard = new TenantGuard();

  it('passes when a tenantId is present in context', () => {
    expect(guard.canActivate(ctx({ userId: 'u1', tenantId: 't1' }))).toBe(true);
  });

  it('rejects when context is missing (UNAUTHENTICATED)', () => {
    try {
      guard.canActivate(ctx(undefined));
      fail('expected TenantGuard to throw');
    } catch (e: any) {
      // AppException's body is the AppException itself; getResponse() returns the envelope.
      expect(e.getResponse()).toMatchObject({ error: 'UNAUTHENTICATED' });
      expect(e.getStatus()).toBe(401);
    }
  });
});