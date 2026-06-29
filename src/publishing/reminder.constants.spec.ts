import { REMINDER_QUEUE, REMINDER_JOB } from './reminder.constants';

describe('reminder constants', () => {
  it('exposes a stable queue name and job name', () => {
    expect(REMINDER_QUEUE).toBe('reminders');
    expect(REMINDER_JOB).toBe('deliver-reminder');
  });
});
