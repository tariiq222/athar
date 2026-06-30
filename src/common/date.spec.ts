import { addDays, addMs, startOfMonth } from './date';

describe('date helpers', () => {
  describe('startOfMonth', () => {
    it('returns the first day of the month at local midnight', () => {
      const now = new Date(2026, 5, 30, 14, 33, 7, 250); // 2026-06-30 14:33:07.250 local
      const r = startOfMonth(now);
      expect(r.getFullYear()).toBe(2026);
      expect(r.getMonth()).toBe(5);
      expect(r.getDate()).toBe(1);
      expect(r.getHours()).toBe(0);
      expect(r.getMinutes()).toBe(0);
      expect(r.getSeconds()).toBe(0);
      expect(r.getMilliseconds()).toBe(0);
    });

    it('matches the original inline construction for the current time', () => {
      const now = new Date();
      const expected = new Date(now.getFullYear(), now.getMonth(), 1);
      // Allow that startOfMonth() snapshots its own `new Date()`; compare the
      // computed first-of-month rather than identical millisecond capture.
      expect(startOfMonth(now).getTime()).toBe(expected.getTime());
    });
  });

  describe('addMs', () => {
    it('adds milliseconds to a Date', () => {
      const base = new Date('2026-06-30T00:00:00.000Z');
      expect(addMs(base, 1000).toISOString()).toBe('2026-06-30T00:00:01.000Z');
    });

    it('adds milliseconds to an epoch number', () => {
      const base = Date.UTC(2026, 5, 30, 0, 0, 0);
      expect(addMs(base, 5000).toISOString()).toBe('2026-06-30T00:00:05.000Z');
    });
  });

  describe('addDays', () => {
    it('adds whole days (ms-equivalent of the original trial computation)', () => {
      const base = Date.UTC(2026, 5, 1, 0, 0, 0);
      const r = addDays(base, 7);
      expect(r.getTime()).toBe(base + 7 * 24 * 60 * 60 * 1000);
    });
  });
});
