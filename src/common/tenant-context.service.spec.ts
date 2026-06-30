import { TenantContextService } from './tenant-context.service';

describe('TenantContextService', () => {
  it('returns "unknown" when no context is set', () => {
    const svc = new TenantContextService();
    expect(svc.getTenantId()).toBe('unknown');
  });

  it('exposes the active tenantId inside runWithTenant (sync)', () => {
    const svc = new TenantContextService();
    const seen = svc.runWithTenant('tn-1', () => svc.getTenantId());
    expect(seen).toBe('tn-1');
  });

  it('propagates across awaits inside runWithTenant', async () => {
    const svc = new TenantContextService();
    const seen = await svc.runWithTenant('tn-2', async () => {
      await Promise.resolve();
      return svc.getTenantId();
    });
    expect(seen).toBe('tn-2');
  });

  it('isolates nested contexts — inner overrides outer', () => {
    const svc = new TenantContextService();
    const out = svc.runWithTenant('outer', () =>
      svc.runWithTenant('inner', () => svc.getTenantId()),
    );
    expect(out).toBe('inner');
  });

  it('restores the outer tenantId after the inner context exits', () => {
    const svc = new TenantContextService();
    let inner: string | undefined;
    let outer: string | undefined;
    svc.runWithTenant('outer', () => {
      outer = svc.getTenantId();
      svc.runWithTenant('inner', () => {
        inner = svc.getTenantId();
      });
      outer = svc.getTenantId();
    });
    expect(inner).toBe('inner');
    expect(outer).toBe('outer');
  });
});