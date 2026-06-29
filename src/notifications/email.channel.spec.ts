import { EmailChannel } from './email.channel';
import type { ReminderNotification } from './notification.types';

const reminder: ReminderNotification = {
  tenantId: 't1',
  postId: 'p1',
  remindAt: '2026-07-01T09:00:00.000Z',
  export: {
    postId: 'p1',
    platform: 'linkedin',
    formattedText: 'Ready to post body',
    imageUrl: 'https://img/p1.png',
    deepLink: 'https://www.linkedin.com/feed/?shareActive=true',
    charCount: 18,
    limitMax: 3000,
    notes: [],
  },
};

function prismaWithUser(email: string | null) {
  return {
    user: { findFirst: jest.fn().mockResolvedValue(email ? { email } : null) },
  } as any;
}

describe('EmailChannel', () => {
  it('has id email', () => {
    expect(new EmailChannel({ sendMail: jest.fn() } as any, prismaWithUser('a@b.c')).id).toBe(
      'email',
    );
  });

  it('sends an RTL Arabic email with the ready text, image and deep link', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    const ch = new EmailChannel({ sendMail } as any, prismaWithUser('a@b.c'));
    const res = await ch.send(reminder);
    expect(res).toEqual({ delivered: true });
    const opts = sendMail.mock.calls[0][0];
    expect(opts.to).toBe('a@b.c');
    expect(opts.html).toContain('dir="rtl"');
    expect(opts.html).toContain('Ready to post body');
    expect(opts.html).toContain('https://img/p1.png');
    expect(opts.html).toContain('https://www.linkedin.com/feed/?shareActive=true');
  });

  it('returns delivered=false when there is no recipient', async () => {
    const sendMail = jest.fn();
    const ch = new EmailChannel({ sendMail } as any, prismaWithUser(null));
    const res = await ch.send(reminder);
    expect(res.delivered).toBe(false);
    expect(res.error).toMatch(/recipient/i);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('returns delivered=false with error on transport failure', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('smtp down'));
    const ch = new EmailChannel({ sendMail } as any, prismaWithUser('a@b.c'));
    const res = await ch.send(reminder);
    expect(res).toEqual({ delivered: false, error: 'smtp down' });
  });
});
