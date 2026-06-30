import { UsageRecorder } from './usage.recorder';
import { TRIAL_PLAN, BUSINESS_PLAN } from '../../config/billing-plans';

describe('UsageRecorder', () => {
  it('writes a UsageRecord row', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = { usageRecord: { create, aggregate: jest.fn() } } as any;
    const rec = new UsageRecorder(prisma);
    await rec.record({ tenantId: 'tn', kind: 'text', units: 3, costUsd: 0.02 });
    expect(create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tn',
        kind: 'text',
        units: 3,
        costUsd: 0.02,
        subscriptionId: undefined,
      },
    });
  });
});

describe('UsageRecorder.canConsume', () => {
  function makeRecorder(
    usage: Array<{ kind: string; units: number; tenantId: string; createdAt: Date }>,
    subscription?: { id?: string; plan: string; status: string; trialEndsAt: Date | null } | null,
  ) {
    const prisma = {
      usageRecord: {
        create: jest.fn(),
        aggregate: jest.fn(async ({ where }: any) => {
          const sum = usage
            .filter(
              (u) =>
                u.tenantId === where.tenantId &&
                u.kind === (where.kind ?? u.kind) &&
                (!where.createdAt || u.createdAt >= where.createdAt.gte),
            )
            .reduce((acc, u) => acc + u.units, 0);
          return { _sum: { units: sum } };
        }),
      },
      subscription: {
        findFirst: jest.fn(async () => subscription ?? null),
        update: jest.fn(async () => ({})),
      },
    } as any;
    return new UsageRecorder(prisma);
  }

  it('allows when used < cap', async () => {
    const rec = makeRecorder(
      [{ kind: 'text', units: 5, tenantId: 't1', createdAt: new Date(Date.now() - 86400_000) }],
      { plan: 'business', status: 'active', trialEndsAt: null },
    );
    const d = await rec.canConsume('t1', 'text', BUSINESS_PLAN);
    expect(d.allowed).toBe(true);
    expect(d.used).toBe(5);
    expect(d.cap).toBe(60);
  });

  it('denies when used >= cap with Arabic reason', async () => {
    const rec = makeRecorder(
      [{ kind: 'image', units: 30, tenantId: 't1', createdAt: new Date(Date.now() - 86400_000) }],
      { plan: 'business', status: 'active', trialEndsAt: null },
    );
    const d = await rec.canConsume('t1', 'image', BUSINESS_PLAN);
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('الصور');
    expect(d.reason).toContain('30');
  });

  it('denies past_due regardless of count', async () => {
    const rec = makeRecorder([], { plan: 'business', status: 'past_due', trialEndsAt: null });
    const d = await rec.canConsume('t1', 'search', BUSINESS_PLAN);
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('متأخّر');
  });

  it('denies canceled regardless of count', async () => {
    const rec = makeRecorder([], { plan: 'business', status: 'canceled', trialEndsAt: null });
    const d = await rec.canConsume('t1', 'search', BUSINESS_PLAN);
    expect(d.allowed).toBe(false);
  });

  it('uses trial plan for trialing tenants', async () => {
    const rec = makeRecorder([], {
      plan: 'trial',
      status: 'trialing',
      trialEndsAt: new Date(Date.now() + 86400_000),
    });
    const d = await rec.getCurrentPlan('t1');
    expect(d.code).toBe('trial');
    const c = await rec.canConsume('t1', 'text', d);
    expect(c.cap).toBe(10);
  });

  it('falls back to TRIAL_PLAN when no subscription row exists (defensive)', async () => {
    const rec = makeRecorder([]);
    const d = await rec.getCurrentPlan('t1');
    expect(d.code).toBe('trial');
    expect(d).toBe(TRIAL_PLAN);
  });
});
