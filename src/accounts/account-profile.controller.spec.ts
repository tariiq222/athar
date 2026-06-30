import { AccountProfileController } from './account-profile.controller';

describe('AccountProfileController', () => {
  const ctx = { userId: 'u1', tenantId: 't1' };
  const service = {
    listForTenant: jest.fn(async () => [{ id: 'a' }]),
    createForTenant: jest.fn(async () => ({ id: 'a' })),
    updateForTenant: jest.fn(async () => ({ id: 'a', handle: 'new' })),
    deleteForTenant: jest.fn(async () => undefined),
  };
  const ctrl = new AccountProfileController(service as any);

  beforeEach(() => jest.clearAllMocks());

  // ── list ─────────────────────────────────────────────────────────────────────

  it('list passes the tenantId from context', async () => {
    await ctrl.list(ctx as any);
    expect(service.listForTenant).toHaveBeenCalledWith('t1');
  });

  it('list does not call any other service method', async () => {
    await ctrl.list(ctx as any);
    expect(service.createForTenant).not.toHaveBeenCalled();
    expect(service.updateForTenant).not.toHaveBeenCalled();
    expect(service.deleteForTenant).not.toHaveBeenCalled();
  });

  it('list returns the service result unchanged', async () => {
    const items = [{ id: 'x', platform: 'linkedin' }];
    service.listForTenant.mockResolvedValueOnce(items as any);
    const out = await ctrl.list(ctx as any);
    expect(out).toBe(items);
  });

  it('list uses tenantId from the context, not a hardcoded value', async () => {
    const otherCtx = { userId: 'u2', tenantId: 't99' };
    await ctrl.list(otherCtx as any);
    expect(service.listForTenant).toHaveBeenCalledWith('t99');
  });

  // ── create ────────────────────────────────────────────────────────────────────

  it('create passes the tenantId from context, not the body', async () => {
    const dto = { brandProfileId: 'bp', platform: 'x' };
    await ctrl.create(ctx as any, dto as any);
    expect(service.createForTenant).toHaveBeenCalledWith('t1', dto);
  });

  it('create forwards the full DTO to the service', async () => {
    const dto = { brandProfileId: 'bp2', platform: 'linkedin', handle: '@co' };
    await ctrl.create(ctx as any, dto as any);
    expect(service.createForTenant).toHaveBeenCalledWith('t1', dto);
  });

  it('create returns the service result', async () => {
    const record = { id: 'new1', tenantId: 't1', platform: 'x' };
    service.createForTenant.mockResolvedValueOnce(record as any);
    const out = await ctrl.create(ctx as any, { brandProfileId: 'b', platform: 'x' } as any);
    expect(out).toBe(record);
  });

  // ── update ────────────────────────────────────────────────────────────────────

  it('update passes tenantId + id', async () => {
    await ctrl.update(ctx as any, 'a', { handle: 'new' } as any);
    expect(service.updateForTenant).toHaveBeenCalledWith('t1', 'a', { handle: 'new' });
  });

  it('update passes the param id, not any body field named id', async () => {
    await ctrl.update(ctx as any, 'param-id', { handle: 'h' } as any);
    const call = service.updateForTenant.mock.calls[0] as unknown[];
    expect(call[1]).toBe('param-id');
  });

  it('update returns the service result', async () => {
    const updated = { id: 'a', handle: 'updated' };
    service.updateForTenant.mockResolvedValueOnce(updated as any);
    const out = await ctrl.update(ctx as any, 'a', { handle: 'updated' } as any);
    expect(out).toBe(updated);
  });

  // ── delete ────────────────────────────────────────────────────────────────────

  it('delete passes tenantId + id', async () => {
    await ctrl.remove(ctx as any, 'a');
    expect(service.deleteForTenant).toHaveBeenCalledWith('t1', 'a');
  });

  it('delete returns the service result (undefined on success)', async () => {
    const out = await ctrl.remove(ctx as any, 'a');
    expect(out).toBeUndefined();
  });

  it('delete propagates an error thrown by the service', async () => {
    const err = new Error('ACCOUNT_NOT_FOUND');
    service.deleteForTenant.mockRejectedValueOnce(err);
    await expect(ctrl.remove(ctx as any, 'ghost')).rejects.toThrow('ACCOUNT_NOT_FOUND');
  });
});
