import { TenantThrottlerGuard } from './tenant-throttler.guard';

/**
 * Test-only subclass exposing the protected getTracker() so the spec can
 * assert the tracker-key resolution without standing up the full Throttler
 * storage + module wiring.
 */
class TestableTenantThrottlerGuard extends TenantThrottlerGuard {
  public trackerFor(req: any): Promise<string> {
    return this.getTracker(req);
  }
}

describe('TenantThrottlerGuard', () => {
  const buildReq = (overrides: Record<string, unknown> = {}) =>
    ({
      ip: '203.0.113.7',
      headers: {},
      socket: { remoteAddress: '203.0.113.7' },
      ...overrides,
    }) as any;

  let guard: TestableTenantThrottlerGuard;

  beforeEach(() => {
    guard = new TestableTenantThrottlerGuard({} as any, {} as any, {} as any);
  });

  it('returns the tenant id when req.tenantContext.tenantId is present', async () => {
    const req = buildReq({ tenantContext: { tenantId: 'tenant-abc' } });
    await expect(guard.trackerFor(req)).resolves.toBe('tenant-abc');
  });

  it('falls back to the request ip when tenantContext is absent', async () => {
    const req = buildReq();
    await expect(guard.trackerFor(req)).resolves.toBe('203.0.113.7');
  });

  it('falls back to the request ip when tenantContext has no tenantId', async () => {
    const req = buildReq({ tenantContext: {} });
    await expect(guard.trackerFor(req)).resolves.toBe('203.0.113.7');
  });
});
