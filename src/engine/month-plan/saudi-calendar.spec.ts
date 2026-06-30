import { distributePlan } from './saudi-calendar';

describe('distributePlan', () => {
  const start = new Date('2026-07-01T00:00:00.000Z');

  it('returns exactly count slots', () => {
    expect(distributePlan(4, start)).toHaveLength(4);
  });

  it('spreads evenly across the month when no occasions', () => {
    const slots = distributePlan(2, start);
    expect(slots[0].date.getUTCDate()).toBeLessThan(slots[1].date.getUTCDate());
    slots.forEach((s) => expect(s.occasion).toBeUndefined());
  });

  it('places occasion dates first and tags them', () => {
    const occ = [{ date: new Date('2026-07-10T00:00:00.000Z'), name: 'National Day' }];
    const slots = distributePlan(3, start, occ);
    expect(slots.some((s) => s.occasion === 'National Day')).toBe(true);
    expect(slots).toHaveLength(3);
  });
});
