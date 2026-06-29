import { Test } from '@nestjs/testing';
import { CalendarService } from './calendar.service';
import { OccasionService } from '../occasions/occasion.service';
import { PostService } from '../posts/post.service';

describe('CalendarService.get', () => {
  it('merges occasions and scheduled posts, sorted by date ascending', async () => {
    const occasionRow = { id: 'o1', tenantId: null, slug: 'nat', kind: 'national', nameAr: 'اليوم الوطني', nameEn: 'Nat', startDate: '2026-09-23', endDate: '2026-09-23', hijriYear: 1448, gregorianYear: 2026 };
    const occasions = {
      list: jest.fn().mockResolvedValue([occasionRow]),
    };
    const postItems = [
      { id: 'p1', platform: 'x', status: 'approved', scheduledAt: '2026-09-22T08:00:00.000Z', text: 'early post', hashtags: [], hasImage: false, citationCount: 0 },
      { id: 'p2', platform: 'x', status: 'draft', scheduledAt: null, text: 'unscheduled', hashtags: [], hasImage: false, citationCount: 0 },
      { id: 'p3', platform: 'linkedin', status: 'pending_review', scheduledAt: '2026-09-23T09:00:00.000Z', text: 'on the day', hashtags: [], hasImage: true, citationCount: 1 },
    ];
    const posts = {
      list: jest.fn().mockResolvedValue({
        items: postItems,
        page: 1, pageSize: 100, total: 2,
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CalendarService,
        { provide: OccasionService, useValue: occasions },
        { provide: PostService, useValue: posts },
      ],
    }).compile();
    const svc = moduleRef.get(CalendarService);

    const res = await svc.get('t1', { from: '2026-09-01', to: '2026-09-30' });

    expect(res).toEqual([
      { type: 'post', date: '2026-09-22', post: { id: 'p1', platform: 'x', status: 'approved', scheduledAt: '2026-09-22T08:00:00.000Z', excerpt: 'early post', hasImage: false } },
      { type: 'occasion', date: '2026-09-23', occasion: occasionRow },
      { type: 'post', date: '2026-09-23', post: { id: 'p3', platform: 'linkedin', status: 'pending_review', scheduledAt: '2026-09-23T09:00:00.000Z', excerpt: 'on the day', hasImage: true } },
    ]);
    expect(res.filter((e) => e.type === 'post')).toHaveLength(2); // unscheduled dropped
  });

  it('passes platform and kind filters through to the underlying services', async () => {
    const occasions = { list: jest.fn().mockResolvedValue([]) };
    const posts = { list: jest.fn().mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CalendarService,
        { provide: OccasionService, useValue: occasions },
        { provide: PostService, useValue: posts },
      ],
    }).compile();
    const svc = moduleRef.get(CalendarService);

    await svc.get('t1', { from: '2026-09-01', to: '2026-09-30', platform: 'linkedin', kind: 'national' });

    expect(occasions.list).toHaveBeenCalledWith('t1', { from: '2026-09-01', to: '2026-09-30', kind: 'national' });
    expect(posts.list).toHaveBeenCalledWith('t1', expect.objectContaining({ platform: 'linkedin' }));
  });
});
