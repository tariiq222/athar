import { ReminderService } from './reminder.service';
import { REMINDER_JOB } from './reminder.constants';

function setup(overrides: { post?: any } = {}) {
  const reminderRows: any[] = [];
  const prisma = {
    post: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          overrides.post === undefined
            ? { id: 'p1', tenantId: 't1', scheduledAt: new Date('2999-01-01T00:00:00.000Z') }
            : overrides.post,
        ),
    },
    reminder: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `r${reminderRows.length + 1}`, createdAt: new Date(), ...data };
        reminderRows.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = reminderRows.find((r) => r.id === where.id);
        Object.assign(row, data);
        return row;
      }),
      findMany: jest.fn().mockResolvedValue(reminderRows),
      findFirst: jest.fn(
        async ({ where }: any) =>
          reminderRows.find((r) => r.id === where.id && r.tenantId === where.tenantId) ?? null,
      ),
    },
  } as any;
  const queue = { add: jest.fn().mockResolvedValue({ id: 'job' }), remove: jest.fn() } as any;
  return { prisma, queue, svc: new ReminderService(prisma, queue), reminderRows };
}

describe('ReminderService.create', () => {
  it('defaults to in_app + email channels and enqueues a delayed job each', async () => {
    const { svc, prisma, queue } = setup();
    const out = await svc.create('t1', { postId: 'p1' });
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.channel).sort()).toEqual(['email', 'in_app']);
    expect(prisma.reminder.create).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledTimes(2);
    const addArgs = queue.add.mock.calls[0];
    expect(addArgs[0]).toBe(REMINDER_JOB);
    expect(addArgs[1]).toMatchObject({ postId: 'p1', tenantId: 't1' });
    expect(addArgs[2].delay).toBeGreaterThan(0);
    expect(addArgs[2].jobId).toBe(out[0].id); // idempotent on reminderId
  });

  it('uses an explicit remindAt and selected channels', async () => {
    const { svc, queue } = setup();
    const future = new Date(Date.now() + 60_000).toISOString();
    const out = await svc.create('t1', { postId: 'p1', channels: ['in_app'], remindAt: future });
    expect(out).toHaveLength(1);
    expect(out[0].channel).toBe('in_app');
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('throws REMIND_AT_REQUIRED when neither remindAt nor scheduledAt exist', async () => {
    const { svc } = setup({ post: { id: 'p1', tenantId: 't1', scheduledAt: null } });
    await expect(svc.create('t1', { postId: 'p1' })).rejects.toMatchObject({
      code: 'REMIND_AT_REQUIRED',
    });
  });

  it('throws REMIND_AT_IN_PAST for a past remindAt', async () => {
    const { svc } = setup();
    await expect(
      svc.create('t1', { postId: 'p1', remindAt: '2000-01-01T00:00:00.000Z' }),
    ).rejects.toMatchObject({ code: 'REMIND_AT_IN_PAST' });
  });

  it('throws NOT_FOUND for a missing or cross-tenant post', async () => {
    const { svc } = setup({ post: null });
    await expect(svc.create('t1', { postId: 'nope' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('ReminderService.cancel', () => {
  it('cancels a scheduled reminder and removes the job', async () => {
    const { svc, queue } = setup();
    const [created] = await svc.create('t1', { postId: 'p1', channels: ['in_app'] });
    const res = await svc.cancel('t1', created.id);
    expect(res.status).toBe('cancelled');
    expect(queue.remove).toHaveBeenCalledWith(created.id);
  });

  it('throws REMINDER_ALREADY_SENT for a sent reminder', async () => {
    const { svc, reminderRows } = setup();
    const [created] = await svc.create('t1', { postId: 'p1', channels: ['in_app'] });
    reminderRows.find((r) => r.id === created.id).status = 'sent';
    await expect(svc.cancel('t1', created.id)).rejects.toMatchObject({
      code: 'REMINDER_ALREADY_SENT',
    });
  });

  it('throws NOT_FOUND for a cross-tenant reminder', async () => {
    const { svc } = setup();
    await expect(svc.cancel('other', 'r1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('ReminderService.list', () => {
  it('lists reminders scoped to tenant + post', async () => {
    const { svc, prisma } = setup();
    await svc.create('t1', { postId: 'p1', channels: ['in_app'] });
    await svc.list('t1', 'p1');
    expect(prisma.reminder.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', postId: 'p1' },
      orderBy: { createdAt: 'desc' },
    });
  });
});
