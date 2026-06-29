import { UserController } from './user.controller';

describe('UserController', () => {
  const ctx = { userId: 'u1', tenantId: 't1' };
  const service = {
    me: jest.fn(async () => ({ user: {}, tenant: {}, subscription: {} })),
    exportData: jest.fn(async () => ({ exportedAt: 'now' })),
    softDelete: jest.fn(async () => ({ status: 'scheduled_for_deletion', purgeAfter: 'later' })),
  };
  const ctrl = new UserController(service as any);

  it('GET me delegates with context', async () => {
    await ctrl.me(ctx as any);
    expect(service.me).toHaveBeenCalledWith(ctx);
  });

  it('POST export delegates with context', async () => {
    await ctrl.export(ctx as any);
    expect(service.exportData).toHaveBeenCalledWith(ctx);
  });

  it('DELETE me delegates context and body', async () => {
    await ctrl.remove(ctx as any, { confirm: true } as any);
    expect(service.softDelete).toHaveBeenCalledWith(ctx, { confirm: true });
  });
});