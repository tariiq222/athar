import { NotificationsController } from './notifications.controller';

const ctx = { userId: 'u1', tenantId: 't1' };

describe('NotificationsController', () => {
  it('GET /notifications passes unreadOnly through to the service', async () => {
    const list = jest.fn().mockResolvedValue([{ id: 'n1' }]);
    const ctrl = new NotificationsController({ list } as any);
    const res = await ctrl.list(ctx as any, 'true');
    expect(res).toEqual([{ id: 'n1' }]);
    expect(list).toHaveBeenCalledWith(ctx, true);
  });

  it('GET /notifications treats a missing query as unreadOnly=false', async () => {
    const list = jest.fn().mockResolvedValue([]);
    const ctrl = new NotificationsController({ list } as any);
    await ctrl.list(ctx as any, undefined);
    expect(list).toHaveBeenCalledWith(ctx, false);
  });

  it('PATCH /notifications/:id/read delegates to the service', async () => {
    const markRead = jest.fn().mockResolvedValue({ id: 'n1', readAt: new Date() });
    const ctrl = new NotificationsController({ markRead } as any);
    const res = await ctrl.markRead(ctx as any, 'n1');
    expect(res.id).toBe('n1');
    expect(markRead).toHaveBeenCalledWith(ctx, 'n1');
  });
});
