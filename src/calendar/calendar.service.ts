import { Injectable } from '@nestjs/common';
import { OccasionService } from '../occasions/occasion.service';
import { PostService } from '../posts/post.service';
import { CalendarEntry } from './calendar.types';
import { SaudiOccasionKind } from '../occasions/occasion.types';
import { CalendarPostSummary, PostPlatform } from '../posts/post.types';

export interface GetCalendarParams {
  from: string;          // ISO date
  to: string;            // ISO date
  platform?: PostPlatform;
  kind?: SaudiOccasionKind;
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly occasions: OccasionService,
    private readonly posts: PostService,
  ) {}

  async get(tenantId: string, params: GetCalendarParams): Promise<CalendarEntry[]> {
    const [occasionRows, postResult] = await Promise.all([
      this.occasions.list(tenantId, { from: params.from, to: params.to, kind: params.kind }),
      this.posts.list(tenantId, {
        from: params.from,
        to: params.to,
        platform: params.platform,
        page: 1,
        // Fetch enough posts to cover the range; pagination is not the calendar's concern.
        pageSize: 100,
      }),
    ]);

    const entries: CalendarEntry[] = [];

    // Occasions: each row creates one entry on its startDate. Multi-day occasions
    // (e.g. Ramadan) appear once — same convention as the spec.
    for (const o of occasionRows) {
      entries.push({ type: 'occasion', date: o.startDate, occasion: o });
    }

    // Posts: only those with a scheduledAt in range (PostService already filtered).
    for (const p of postResult.items) {
      if (!p.scheduledAt) continue;
      const summary: CalendarPostSummary = {
        id: p.id,
        platform: p.platform,
        status: p.status,
        scheduledAt: p.scheduledAt,
        excerpt: p.text.slice(0, 120),
        hasImage: p.hasImage,
      };
      const date = p.scheduledAt.slice(0, 10); // ISO datetime → ISO date
      entries.push({ type: 'post', date, post: summary });
    }

    // Sort: date ascending; ties break by type ('occasion' first) then by id.
    entries.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.type !== b.type) return a.type === 'occasion' ? -1 : 1;
      const aId = a.occasion?.id ?? a.post?.id ?? '';
      const bId = b.occasion?.id ?? b.post?.id ?? '';
      return aId < bId ? -1 : aId > bId ? 1 : 0;
    });

    return entries;
  }
}
