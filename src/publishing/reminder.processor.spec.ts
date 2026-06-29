import { ReminderProcessor } from './reminder.processor';

function setup(
  opts: { reminder?: any; buildPayload?: jest.Mock; dispatch?: jest.Mock } = {},
) {
  const update = jest.fn().mockResolvedValue({});
  const prisma = {
    reminder: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opts.reminder === undefined ? { id: 'r1', status: 'scheduled', remindAt: new Date() } : opts.reminder,
        ),
      update,
    },
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
  return { proc, prisma, update, exportSvc, dispatcher };
}

const job = (data: any) => ({ data } as any);

describe('ReminderProcessor', () => {
  it('delivers and marks the reminder sent', async () => {
    const { proc, update, dispatcher } = setup();
    await proc.process(
      job({ reminderId: 'r1', postId: 'p1', tenantId: 't1', channel: 'in_app' }),
    );
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      'in_app',
      expect.objectContaining({ tenantId: 't1', postId: 'p1' }),
    );
    expect(update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { status: 'sent' } });
  });

  it('marks failed when the channel does not deliver (no throw)', async () => {
    const { proc, update } = setup({
      dispatch: jest.fn().mockResolvedValue({ delivered: false, error: 'x' }),
    });
    await proc.process(job({ reminderId: 'r1', postId: 'p1', tenantId: 't1', channel: 'email' }));
    expect(update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { status: 'failed' } });
  });

  it('is idempotent: skips a reminder already sent', async () => {
    const { proc, update, dispatcher } = setup({ reminder: { id: 'r1', status: 'sent', remindAt: new Date() } });
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
    await proc.process(
      job({ reminderId: 'r1', postId: 'p1', tenantId: 't1', channel: 'in_app' }),
    );
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { status: 'cancelled' } });
  });
});
