import { PublishingController } from './publishing.controller';

const ctx = { userId: 'u1', tenantId: 't1' };

function make(parts: any) {
  return new PublishingController(
    parts.exportService ?? { buildPayload: jest.fn() },
    parts.reminderService ?? { create: jest.fn(), list: jest.fn(), cancel: jest.fn() },
    parts.markPublished ?? { markPublished: jest.fn() },
  );
}

describe('PublishingController', () => {
  it('GET export passes tenant + platform through', async () => {
    const buildPayload = jest.fn().mockResolvedValue({ postId: 'p1' });
    const ctrl = make({ exportService: { buildPayload } });
    const res = await ctrl.export(ctx as any, 'p1', 'x');
    expect(res).toEqual({ postId: 'p1' });
    expect(buildPayload).toHaveBeenCalledWith('t1', 'p1', 'x');
  });

  it('GET export defaults platform to undefined when not provided', async () => {
    const buildPayload = jest.fn().mockResolvedValue({});
    const ctrl = make({ exportService: { buildPayload } });
    await ctrl.export(ctx as any, 'p1', undefined);
    expect(buildPayload).toHaveBeenCalledWith('t1', 'p1', undefined);
  });

  it('POST mark-published passes tenant + publishedAt', async () => {
    const markPublished = jest.fn().mockResolvedValue({ status: 'published' });
    const ctrl = make({ markPublished: { markPublished } });
    await ctrl.markPublished(ctx as any, 'p1', { publishedAt: '2026-06-30T00:00:00.000Z' });
    expect(markPublished).toHaveBeenCalledWith('t1', 'p1', '2026-06-30T00:00:00.000Z');
  });

  it('POST reminders forwards the dto', async () => {
    const create = jest.fn().mockResolvedValue([{ id: 'r1' }]);
    const ctrl = make({ reminderService: { create, list: jest.fn(), cancel: jest.fn() } });
    const dto = { postId: 'p1', channels: ['in_app'] };
    const res = await ctrl.createReminder(ctx as any, dto as any);
    expect(res).toEqual([{ id: 'r1' }]);
    expect(create).toHaveBeenCalledWith('t1', dto);
  });

  it('DELETE reminders/:id cancels', async () => {
    const cancel = jest.fn().mockResolvedValue({ id: 'r1', status: 'cancelled' });
    const ctrl = make({ reminderService: { create: jest.fn(), list: jest.fn(), cancel } });
    const res = await ctrl.cancelReminder(ctx as any, 'r1');
    expect(res.status).toBe('cancelled');
    expect(cancel).toHaveBeenCalledWith('t1', 'r1');
  });

  it('GET posts/:id/reminders lists', async () => {
    const list = jest.fn().mockResolvedValue([{ id: 'r1' }]);
    const ctrl = make({ reminderService: { create: jest.fn(), list, cancel: jest.fn() } });
    const res = await ctrl.listReminders(ctx as any, 'p1');
    expect(res).toEqual([{ id: 'r1' }]);
    expect(list).toHaveBeenCalledWith('t1', 'p1');
  });
});
