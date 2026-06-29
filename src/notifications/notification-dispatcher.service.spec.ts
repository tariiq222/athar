import { NotificationDispatcher } from './notification-dispatcher.service';
import type {
  NotificationChannel,
  ReminderNotification,
} from './notification.types';

const reminder: ReminderNotification = {
  tenantId: 't1',
  postId: 'p1',
  remindAt: '2026-07-01T09:00:00.000Z',
  export: {
    postId: 'p1',
    platform: 'x',
    formattedText: 'Ready',
    deepLink: 'https://x.com/intent/post',
    charCount: 5,
    limitMax: 280,
    notes: [],
  },
};

function channel(id: any, impl: () => Promise<any>): NotificationChannel {
  return { id, send: impl } as NotificationChannel;
}

describe('NotificationDispatcher', () => {
  it('dispatches to the channel matching the id', async () => {
    const inApp = channel('in_app', async () => ({ delivered: true }));
    const email = channel('email', async () => ({ delivered: false, error: 'x' }));
    const d = new NotificationDispatcher([inApp, email]);
    await expect(d.dispatch('in_app', reminder)).resolves.toEqual({ delivered: true });
  });

  it('returns delivered=false for an unknown channel id', async () => {
    const d = new NotificationDispatcher([]);
    await expect(d.dispatch('whatsapp' as any, reminder)).resolves.toEqual({
      delivered: false,
      error: 'unknown channel: whatsapp',
    });
  });

  it('catches a throwing channel so it cannot propagate', async () => {
    const boom = channel('email', async () => {
      throw new Error('kaboom');
    });
    const d = new NotificationDispatcher([boom]);
    await expect(d.dispatch('email', reminder)).resolves.toEqual({
      delivered: false,
      error: 'kaboom',
    });
  });
});
