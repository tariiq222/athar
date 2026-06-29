import { NotificationsService } from './notifications.service';

const ctx = { userId: 'u1', tenantId: 't1' };

describe('NotificationsService', () => {
  it('lists tenant + user-scoped notifications newest first', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'n1' }]);
    const svc = new NotificationsService({ notification: { findMany } } as any);
    const res = await svc.list(ctx as any);
    expect(res).toEqual([{ id: 'n1' }]);
    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', OR: [{ userId: 'u1' }, { userId: null }] },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('filters unread only when requested', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = new NotificationsService({ notification: { findMany } } as any);
    await svc.list(ctx as any, true);
    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', OR: [{ userId: 'u1' }, { userId: null }], readAt: null },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('marks an unread notification read (sets readAt)', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'n1', readAt: null });
    const update = jest.fn().mockResolvedValue({ id: 'n1', readAt: new Date() });
    const svc = new NotificationsService({
      notification: { findFirst, update },
    } as any);
    const res = await svc.markRead(ctx as any, 'n1');
    expect(res.readAt).not.toBeNull();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { readAt: expect.any(Date) },
    });
  });

  it('is idempotent: already-read notification keeps its readAt and returns 200', async () => {
    const prior = new Date('2026-06-01T00:00:00.000Z');
    const findFirst = jest.fn().mockResolvedValue({ id: 'n1', readAt: prior });
    const update = jest.fn();
    const svc = new NotificationsService({
      notification: { findFirst, update },
    } as any);
    const res = await svc.markRead(ctx as any, 'n1');
    expect(res.readAt).toEqual(prior);
    expect(update).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND for a cross-tenant notification', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const svc = new NotificationsService({ notification: { findFirst } } as any);
    try {
      await svc.markRead(ctx as any, 'x');
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e.code).toBe('NOT_FOUND');
      expect(e.getStatus?.()).toBe(404);
    }
  });
});
