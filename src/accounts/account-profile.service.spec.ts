import { AccountProfileService } from './account-profile.service';

type Row = Record<string, any>;

function makePrismaMock(seed: Row[] = []) {
  const rows: Row[] = [...seed];
  return {
    rows,
    accountProfile: {
      findMany: async ({ where }: { where: { tenantId: string } }) =>
        rows.filter((r: Row) => r.tenantId === where.tenantId),
      create: async ({ data }: { data: Row }) => {
        const row: Row = { id: 'ap' + (rows.length + 1), ...data };
        rows.push(row);
        return row;
      },
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
        rows.find((r: Row) => r.id === where.id && r.tenantId === where.tenantId) ?? null,
      // Scope is enforced by the preceding findFirst guard; here we
      // match the real client's unique-id selector.
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = rows.find((r: Row) => r.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const idx = rows.findIndex((r: Row) => r.id === where.id);
        if (idx === -1) throw new Error('not found');
        const [removed] = rows.splice(idx, 1);
        return removed;
      },
    },
  };
}

describe('AccountProfileService', () => {
  it('lists only the current tenant rows', async () => {
    const prisma = makePrismaMock([
      { id: 'a', tenantId: 't1', platform: 'x' },
      { id: 'b', tenantId: 't2', platform: 'x' },
    ]);
    const svc = new AccountProfileService(prisma as any);
    const out = await svc.listForTenant('t1');
    expect(out.map((r: Row) => r.id)).toEqual(['a']);
  });

  it('create injects tenantId from context, ignoring any DTO tenantId', async () => {
    const prisma = makePrismaMock();
    const svc = new AccountProfileService(prisma as any);
    const created = await svc.createForTenant('t1', {
      brandProfileId: 'bp1',
      platform: 'linkedin',
      // a forged tenantId here must NOT win
      tenantId: 't-EVIL',
    } as any);
    expect(created.tenantId).toBe('t1');
  });

  it('update of a row in scope succeeds', async () => {
    const prisma = makePrismaMock([{ id: 'a', tenantId: 't1', handle: 'old' }]);
    const svc = new AccountProfileService(prisma as any);
    const out = await svc.updateForTenant('t1', 'a', { handle: 'new' });
    expect(out.handle).toBe('new');
  });

  it('update of another tenant row throws ACCOUNT_NOT_FOUND (404, not 403)', async () => {
    const prisma = makePrismaMock([{ id: 'a', tenantId: 't2', handle: 'old' }]);
    const svc = new AccountProfileService(prisma as any);
    await expect(svc.updateForTenant('t1', 'a', { handle: 'x' })).rejects.toMatchObject({
      response: { error: 'ACCOUNT_NOT_FOUND' },
    });
  });

  it('delete of another tenant row throws ACCOUNT_NOT_FOUND', async () => {
    const prisma = makePrismaMock([{ id: 'a', tenantId: 't2' }]);
    const svc = new AccountProfileService(prisma as any);
    await expect(svc.deleteForTenant('t1', 'a')).rejects.toMatchObject({
      response: { error: 'ACCOUNT_NOT_FOUND' },
    });
  });

  it('delete of a row in scope removes it', async () => {
    const prisma = makePrismaMock([{ id: 'a', tenantId: 't1' }]);
    const svc = new AccountProfileService(prisma as any);
    await svc.deleteForTenant('t1', 'a');
    expect(prisma.rows).toHaveLength(0);
  });
});
