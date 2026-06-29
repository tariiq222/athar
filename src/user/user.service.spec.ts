import { ConfigService } from '@nestjs/config';
import { UserService } from './user.service';

function makePrismaMock() {
  const tenant = { id: 't1', name: 'Acme', deletedAt: null, purgeAfter: null };
  const users = [{ id: 'u1', tenantId: 't1', email: 'a@b.com', name: 'A', passwordHash: 'H', refreshTokenHash: 'R' }];
  const subscriptions = [{ id: 's1', tenantId: 't1', status: 'trialing', plan: 'trial', trialEndsAt: new Date() }];
  return {
    tenant,
    users,
    subscriptions,
    user: {
      findFirst: async ({ where, select }: any) => {
        const u = users.find((x) => x.id === where.id && x.tenantId === where.tenantId);
        if (!u) return null;
        if (select) {
          const out: any = {};
          for (const k of Object.keys(select)) if (select[k]) out[k] = (u as any)[k];
          return out;
        }
        return u;
      },
      findMany: async ({ where, select }: any) =>
        users
          .filter((u) => u.tenantId === where.tenantId)
          .map((u) => {
            if (!select) return u;
            const out: any = {};
            for (const k of Object.keys(select)) if (select[k]) out[k] = (u as any)[k];
            return out;
          }),
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const u of users) if (u.tenantId === where.tenantId) { Object.assign(u, data); count++; }
        return { count };
      },
    },
    tenant_: undefined,
    findTenant: undefined,
    subscription: {
      findFirst: async ({ where }: any) =>
        subscriptions.filter((s) => s.tenantId === where.tenantId).slice(-1)[0] ?? null,
      findMany: async ({ where }: any) => subscriptions.filter((s) => s.tenantId === where.tenantId),
    },
    brandProfile: { findMany: async () => [] },
    post: { findMany: async () => [] },
    accountProfile: { findMany: async ({ where }: any) => (where.tenantId === 't1' ? [{ id: 'ap1', tenantId: 't1' }] : []) },
    tenantTable: {
      findFirst: async ({ where, select }: any) => {
        if (tenant.id !== where.id) return null;
        if (!select) return tenant;
        const out: any = {};
        for (const k of Object.keys(select)) if (select[k]) out[k] = (tenant as any)[k];
        return out;
      },
      update: async ({ where: _where, data }: any) => { Object.assign(tenant, data); return tenant; },
    },
  };
}

// Bind the tenant delegate name used by the service.
function asPrisma(mock: any) {
  return { ...mock, tenant: { findFirst: mock.tenantTable.findFirst, update: mock.tenantTable.update }, _t: mock.tenant };
}

function makeService(mock: any) {
  const config = { get: (k: string) => ({ PURGE_RETENTION_DAYS: '30' }[k]) } as unknown as ConfigService;
  return new UserService(asPrisma(mock) as any, config);
}

const ctx = { userId: 'u1', tenantId: 't1' };

describe('UserService', () => {
  it('me returns user+tenant+subscription without passwordHash', async () => {
    const mock = makePrismaMock();
    const svc = makeService(mock);
    const out = await svc.me(ctx);
    expect(out.user).toEqual({ id: 'u1', email: 'a@b.com', name: 'A' });
    expect((out.user as any).passwordHash).toBeUndefined();
    expect(out.tenant).toEqual({ id: 't1', name: 'Acme' });
    expect(out.subscription).toMatchObject({ status: 'trialing', plan: 'trial' });
  });

  it('exportData returns tenant bundle, users carry no passwordHash', async () => {
    const mock = makePrismaMock();
    const svc = makeService(mock);
    const out = await svc.exportData(ctx);
    expect(typeof out.exportedAt).toBe('string');
    expect(out.accountProfiles).toHaveLength(1);
    expect((out.users[0] as any).passwordHash).toBeUndefined();
    expect((out.users[0] as any).refreshTokenHash).toBeUndefined();
  });

  it('softDelete without confirm throws CONFIRMATION_REQUIRED and changes nothing', async () => {
    const mock = makePrismaMock();
    const svc = makeService(mock);
    await expect(svc.softDelete(ctx, { confirm: false })).rejects.toMatchObject({
      response: { error: 'CONFIRMATION_REQUIRED' },
    });
    expect(mock.tenant.deletedAt).toBeNull();
  });

  it('softDelete with confirm marks deletedAt, schedules purge, invalidates sessions', async () => {
    const mock = makePrismaMock();
    const svc = makeService(mock);
    const out = await svc.softDelete(ctx, { confirm: true });
    expect(out.status).toBe('scheduled_for_deletion');
    expect(typeof out.purgeAfter).toBe('string');
    expect(mock.tenant.deletedAt).toBeInstanceOf(Date);
    expect(mock.users[0].refreshTokenHash).toBeNull();
  });
});
