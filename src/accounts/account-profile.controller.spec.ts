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

  it('list passes the tenantId from context', async () => {
    await ctrl.list(ctx as any);
    expect(service.listForTenant).toHaveBeenCalledWith('t1');
  });

  it('create passes the tenantId from context, not the body', async () => {
    const dto = { brandProfileId: 'bp', platform: 'x' };
    await ctrl.create(ctx as any, dto as any);
    expect(service.createForTenant).toHaveBeenCalledWith('t1', dto);
  });

  it('update passes tenantId + id', async () => {
    await ctrl.update(ctx as any, 'a', { handle: 'new' } as any);
    expect(service.updateForTenant).toHaveBeenCalledWith('t1', 'a', { handle: 'new' });
  });

  it('delete passes tenantId + id', async () => {
    await ctrl.remove(ctx as any, 'a');
    expect(service.deleteForTenant).toHaveBeenCalledWith('t1', 'a');
  });
});
