import { SAUDI_OCCASION_KINDS } from '../occasions/occasion.types';
import { EXCERPT_LENGTH, CalendarPostSummary } from '../posts/post.types';
import { CalendarEntry } from './calendar.types';

describe('shared domain types', () => {
  it('exposes the six Saudi occasion kinds', () => {
    expect([...SAUDI_OCCASION_KINDS]).toEqual([
      'national',
      'foundation',
      'ramadan',
      'eid_fitr',
      'eid_adha',
      'commercial',
    ]);
  });

  it('excerpt length is 120', () => {
    expect(EXCERPT_LENGTH).toBe(120);
  });

  it('a post CalendarEntry has the expected shape', () => {
    const post: CalendarPostSummary = {
      id: 'p1',
      platform: 'x',
      status: 'approved',
      scheduledAt: '2026-09-23T09:00:00.000Z',
      excerpt: 'hi',
      hasImage: false,
    };
    const entry: CalendarEntry = { type: 'post', date: '2026-09-23', post };
    expect(entry.type).toBe('post');
    expect(entry.post?.id).toBe('p1');
  });

  it('an occasion CalendarEntry can hold an occasion', () => {
    const entry: CalendarEntry = {
      type: 'occasion',
      date: '2026-09-23',
      occasion: {
        id: 'o1',
        tenantId: null,
        slug: 'saudi-national-day',
        kind: 'national',
        nameAr: 'اليوم الوطني',
        nameEn: 'Saudi National Day',
        startDate: '2026-09-23',
        endDate: '2026-09-23',
        hijriYear: 1448,
        gregorianYear: 2026,
      },
    };
    expect(entry.occasion?.slug).toBe('saudi-national-day');
  });
});
