import { InAppChannel } from './in-app.channel';
import type { ReminderNotification } from './notification.types';

const reminder: ReminderNotification = {
  tenantId: 't1',
  postId: 'p1',
  remindAt: '2026-07-01T09:00:00.000Z',
  export: {
    postId: 'p1',
    platform: 'x',
    formattedText: 'Ready to post',
    deepLink: 'https://x.com/intent/post',
    charCount: 13,
    limitMax: 280,
    notes: [],
  },
};

describe('InAppChannel', () => {
  it('has id in_app', () => {
    expect(new InAppChannel({} as any).id).toBe('in_app');
  });

  it('writes a reminder Notification row scoped to the tenant', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'n1' });
    const ch = new InAppChannel({ notification: { create } } as any);
    const res = await ch.send(reminder);
    expect(res).toEqual({ delivered: true });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 't1',
        type: 'reminder',
        postId: 'p1',
      }),
    });
    const data = create.mock.calls[0][0].data;
    expect(typeof data.title).toBe('string');
    expect(data.title.length).toBeGreaterThan(0);
    expect(typeof data.body).toBe('string');
  });

  it('returns delivered=false with error on db failure', async () => {
    const create = jest.fn().mockRejectedValue(new Error('db down'));
    const ch = new InAppChannel({ notification: { create } } as any);
    const res = await ch.send(reminder);
    expect(res).toEqual({ delivered: false, error: 'db down' });
  });
});
