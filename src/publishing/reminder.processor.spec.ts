import { ReminderProcessor } from './reminder.processor';

function setup(
  opts: {
    reminder?: any;
    buildPayload?: jest.Mock;
    dispatch?: jest.Mock;
    tenantId?: string;
  } = {},
) {
  const update = jest.fn().mockResolvedValue({});
  const reminder =
    opts.reminder === undefined
      ? { id: 'r1', tenantId: opts.tenantId ?? 't1', status: 'scheduled', remindAt: new Date() }
      : opts.reminder;
  // findFirst now carries a { id, tenantId } predicate; the mock honors the
  // tenantId so a cross-tenant reminderId resolves to null (dropped silently).
  const findFirst = jest.fn().mockImplementation(({ where }: any) => {
    if (reminder && where.tenantId === reminder.tenantId && where.id === reminder.id) {
      return Promise.resolve(reminder);
    }
    return Promise.resolve(null);
  });
  const prisma = {
    reminder: { findFirst, update },
  } as any;
  const exportSvc = {
    buildPayload:
      opts.buildPayload ??
      jest.fn().mockResolvedValue({
        postId: 'p1',
        platform: 'x',
        formattedText: 'ready',
        deepLink: 'https://x.com/intent/post',
        charCount: 5,
        limitMax: 280,
        notes: [],
      }),
  } as any;
  const dispatcher = {
    dispatch: opts.dispatch ?? jest.fn().mockResolvedValue({ delivered: true }),
  } as any;
  const proc = new ReminderProcessor(prisma, exportSvc, dispatcher);
  return { proc, prisma, findFirst, update, exportSvc, dispatcher };
}

const job = (data: any) => ({ data }) as any;

describe('ReminderProcessor', () => {
  it('delivers and marks the reminder sent', async () => {
    const { proc, findFirst, update, dispatcher } = setup();
    await proc.process(job({ reminderId: 'r1', postId: 'p1', tenantId: 't1', channel: 'in_app' }));
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'r1', tenantId: 't1' },
    });
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      'in_app',
      expect.objectContaining({ tenantId: 't1', postId: 'p1' }),
    );
    expect(update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { status: 'sent' } });
  });

  it('drops a reminder belonging to another tenant (no cross-tenant delivery)', async () => {
    // Reminder is owned by t1, but the job carries tenantId t2 (forged/stale).
    const { proc, findFirst, update, dispatcher } = setup({
      reminder: { id: 'r1', tenantId: 't1', status: 'scheduled', remindAt: new Date() },
    });
    await proc.process(job({ reminderId: 'r1', postId: 'p1', tenantId: 't2', channel: 'in_app' }));
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'r1', tenantId: 't2' },
    });
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('marks failed when the channel does not deliver (no throw)', async () => {
    const { proc, update } = setup({
      dispatch: jest.fn().mockResolvedValue({ delivered: false, error: 'x' }),
    });
    await proc.process(job({ reminderId: 'r1', postId: 'p1', tenantId: 't1', channel: 'email' }));
    expect(update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { status: 'failed' } });
  });

  it('is idempotent: skips a reminder already sent', async () => {
    const { proc, update, dispatcher } = setup({
      reminder: { id: 'r1', tenantId: 't1', status: 'sent', remindAt: new Date() },
    });
    await proc.process(job({ reminderId: 'r1', postId: 'p1', tenantId: 't1', channel: 'in_app' }));
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('skips a missing reminder silently', async () => {
    const { proc, dispatcher } = setup({ reminder: null });
    await proc.process(
      job({ reminderId: 'gone', postId: 'p1', tenantId: 't1', channel: 'in_app' }),
    );
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('cancels the reminder quietly when the post is gone/not-approved', async () => {
    const { proc, update, dispatcher } = setup({
      buildPayload: jest.fn().mockRejectedValue(new Error('not approved')),
    });
    await proc.process(job({ reminderId: 'r1', postId: 'p1', tenantId: 't1', channel: 'in_app' }));
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { status: 'cancelled' } });
  });
});
