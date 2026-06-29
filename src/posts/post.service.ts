import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { PostStatus } from '../generated/prisma/enums';
import {
  PostListItem,
  PostPlatform,
} from './post.types';

export interface ListPostsParams {
  status?: PostStatus;
  platform?: PostPlatform;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface ListPostsResult {
  items: PostListItem[];
  page: number;
  pageSize: number;
  total: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class PostService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, params: ListPostsParams): Promise<ListPostsResult> {
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = Math.min(
      params.pageSize && params.pageSize > 0 ? params.pageSize : DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );

    const where: Record<string, unknown> = { tenantId };
    if (params.status) where.status = params.status;
    if (params.platform) where.platform = params.platform;
    if (params.from || params.to) {
      const scheduledAt: Record<string, Date> = {};
      if (params.from) scheduledAt.gte = new Date(params.from);
      if (params.to) scheduledAt.lte = new Date(params.to);
      where.scheduledAt = scheduledAt;
    }

    const [rows, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: { image: true, _count: { select: { citations: true } } },
        orderBy: [
          { scheduledAt: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.post.count({ where }),
    ]);

    return {
      items: rows.map((r: any) => this.toListItem(r)),
      page,
      pageSize,
      total,
    };
  }

  private toListItem(row: any): PostListItem {
    return {
      id: row.id,
      platform: row.platform as PostPlatform,
      status: row.status as PostStatus,
      scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
      text: row.text,
      hashtags: row.hashtags,
      hasImage: !!row.image,
      citationCount: row._count?.citations ?? 0,
    };
  }
}
