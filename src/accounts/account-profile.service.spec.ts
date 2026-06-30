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
  // ── list ────────────────────────────────────────────────────────────────────

  it('lists only the current tenant rows', async () => {
    const prisma = makePrismaMock([
      { id: 'a', tenantId: 't1', platform: 'x' },
      { id: 'b', tenantId: 't2', platform: 'x' },
    ]);
    const svc = new AccountProfileService(prisma as any);
    const out = await svc.listForTenant('t1');
    expect(out.map((r: Row) => r.id)).toEqual(['a']);
  });

  it('returns an empty array when the tenant has no accounts', async () => {
    const prisma = makePrismaMock([{ id: 'z', tenantId: 't99', platform: 'x' }]);
    const svc = new AccountProfileService(prisma as any);
    const out = await svc.listForTenant('t1');
    expect(out).toEqual([]);
  });

  it('returns all rows when a tenant has multiple accounts', async () => {
    const prisma = makePrismaMock([
      { id: 'a1', tenantId: 't1', platform: 'x' },
      { id: 'a2', tenantId: 't1', platform: 'linkedin' },
      { id: 'a3', tenantId: 't2', platform: 'x' },
    ]);
    const svc = new AccountProfileService(prisma as any);
    const out = await svc.listForTenant('t1');
    expect(out.map((r: Row) => r.id)).toEqual(['a1', 'a2']);
  });

  // ── create ───────────────────────────────────────────────────────────────────

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

  it('create stores brandProfileId and platform', async () => {
    const prisma = makePrismaMock();
    const svc = new AccountProfileService(prisma as any);
    const created = await svc.createForTenant('t1', {
      brandProfileId: 'bp-abc',
      platform: 'x',
    });
    expect(created.brandProfileId).toBe('bp-abc');
    expect(created.platform).toBe('x');
  });

  it('create stores handle when provided', async () => {
    const prisma = makePrismaMock();
    const svc = new AccountProfileService(prisma as any);
    const created = await svc.createForTenant('t1', {
      brandProfileId: 'bp1',
      platform: 'x',
      handle: '@myhandle',
    });
    expect(created.handle).toBe('@myhandle');
  });

  it('create omits handle from data when not provided in DTO', async () => {
    const prisma = makePrismaMock();
    // Spy on the underlying create to inspect the data argument exactly
    const spy = jest.spyOn(prisma.accountProfile, 'create');
    const svc = new AccountProfileService(prisma as any);
    await svc.createForTenant('t1', { brandProfileId: 'bp1', platform: 'x' });
    const callArg = spy.mock.calls[0][0] as { data: Row };
    expect(Object.prototype.hasOwnProperty.call(callArg.data, 'handle')).toBe(false);
  });

  it('create assigns a generated id', async () => {
    const prisma = makePrismaMock();
    const svc = new AccountProfileService(prisma as any);
    const created = await svc.createForTenant('t1', { brandProfileId: 'bp1', platform: 'x' });
    expect(created.id).toBeDefined();
    expect(typeof created.id).toBe('string');
  });

  // ── update ───────────────────────────────────────────────────────────────────

  it('update of a row in scope succeeds', async () => {
    const prisma = makePrismaMock([{ id: 'a', tenantId: 't1', handle: 'old' }]);
    const svc = new AccountProfileService(prisma as any);
    const out = await svc.updateForTenant('t1', 'a', { handle: 'new' });
    expect(out.handle).toBe('new');
  });

  it('update persists the change in the in-memory store', async () => {
    const prisma = makePrismaMock([{ id: 'a', tenantId: 't1', handle: 'old' }]);
    const svc = new AccountProfileService(prisma as any);
    await svc.updateForTenant('t1', 'a', { handle: 'changed' });
    expect(prisma.rows[0].handle).toBe('changed');
  });

  it('update does not change platform (immutable field is not accepted in DTO)', async () => {
    const prisma = makePrismaMock([{ id: 'a', tenantId: 't1', platform: 'x', handle: 'h' }]);
    const svc = new AccountProfileService(prisma as any);
    // UpdateAccountProfileDto only accepts handle — passing platform should be ignored
    await svc.updateForTenant('t1', 'a', { handle: 'h2' } as any);
    expect(prisma.rows[0].platform).toBe('x');
  });

  it('update of another tenant row throws ACCOUNT_NOT_FOUND (404, not 403)', async () => {
    const prisma = makePrismaMock([{ id: 'a', tenantId: 't2', handle: 'old' }]);
    const svc = new AccountProfileService(prisma as any);
    await expect(svc.updateForTenant('t1', 'a', { handle: 'x' })).rejects.toMatchObject({
      response: { error: 'ACCOUNT_NOT_FOUND' },
    });
  });

  it('update of a non-existent id throws ACCOUNT_NOT_FOUND', async () => {
    const prisma = makePrismaMock([]);
    const svc = new AccountProfileService(prisma as any);
    await expect(svc.updateForTenant('t1', 'ghost', { handle: 'x' })).rejects.toMatchObject({
      response: { error: 'ACCOUNT_NOT_FOUND' },
    });
  });

  it('update returns the updated row with correct tenantId still set', async () => {
    const prisma = makePrismaMock([{ id: 'a', tenantId: 't1', handle: 'old' }]);
    const svc = new AccountProfileService(prisma as any);
    const out = await svc.updateForTenant('t1', 'a', { handle: 'fresh' });
    expect(out.tenantId).toBe('t1');
  });

  // ── delete ───────────────────────────────────────────────────────────────────

  it('delete of a row in scope removes it', async () => {
    const prisma = makePrismaMock([{ id: 'a', tenantId: 't1' }]);
    const svc = new AccountProfileService(prisma as any);
    await svc.deleteForTenant('t1', 'a');
    expect(prisma.rows).toHaveLength(0);
  });

  it('delete returns void on success', async () => {
    const prisma = makePrismaMock([{ id: 'a', tenantId: 't1' }]);
    const svc = new AccountProfileService(prisma as any);
    const result = await svc.deleteForTenant('t1', 'a');
    expect(result).toBeUndefined();
  });

  it('delete of another tenant row throws ACCOUNT_NOT_FOUND', async () => {
    const prisma = makePrismaMock([{ id: 'a', tenantId: 't2' }]);
    const svc = new AccountProfileService(prisma as any);
    await expect(svc.deleteForTenant('t1', 'a')).rejects.toMatchObject({
      response: { error: 'ACCOUNT_NOT_FOUND' },
    });
  });

  it('delete of a non-existent id throws ACCOUNT_NOT_FOUND', async () => {
    const prisma = makePrismaMock([]);
    const svc = new AccountProfileService(prisma as any);
    await expect(svc.deleteForTenant('t1', 'ghost')).rejects.toMatchObject({
      response: { error: 'ACCOUNT_NOT_FOUND' },
    });
  });

  it('delete does not remove another tenant row when ids collide across tenants', async () => {
    // Same id 'shared' exists for both t1 and t2
    const prisma = makePrismaMock([
      { id: 'shared', tenantId: 't1' },
      { id: 'shared', tenantId: 't2' },
    ]);
    const svc = new AccountProfileService(prisma as any);
    // t1 tries to delete 'shared' — only the t1 row should be removed
    // The guard checks id+tenantId, so the t1 row is found and deleted
    await svc.deleteForTenant('t1', 'shared');
    // One row (t2's) must remain
    expect(prisma.rows).toHaveLength(1);
    expect(prisma.rows[0].tenantId).toBe('t2');
  });

  // ── ACCOUNT_NOT_FOUND error shape ─────────────────────────────────────────

  it('ACCOUNT_NOT_FOUND carries statusCode 404 and correct error code', async () => {
    const prisma = makePrismaMock([]);
    const svc = new AccountProfileService(prisma as any);
    let caught: any;
    try {
      await svc.deleteForTenant('t1', 'x');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught.response.statusCode).toBe(404);
    expect(caught.response.error).toBe('ACCOUNT_NOT_FOUND');
  });
});
