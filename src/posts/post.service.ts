import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/error-envelope';
import { PostStateMachine, PostStatusTransition } from './post-state-machine';
import {
  PostCitation,
  PostDetail,
  PostImage,
  PostListItem,
  PostPlatform,
} from './post.types';
import type { PostStatus } from '../generated/prisma/enums';

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

export interface PatchPostInput {
  text?: string;
  hashtags?: string[];
  image?: { url: string; method: string };
  image_null?: boolean;
  scheduledAt?: string;
  scheduledAt_null?: boolean;
  transition?: PostStatusTransition;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class PostService {
  private readonly stateMachine = new PostStateMachine();

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

  async patch(tenantId: string, postId: string, dto: PatchPostInput): Promise<PostDetail> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Load the post (tenant-scoped) — NOT_FOUND if missing or other tenant
      const existing = await tx.post.findFirst({
        where: { id: postId, tenantId },
        include: { image: true, citations: true },
      });
      if (!existing) {
        throw new AppError(404, 'NOT_FOUND', 'البوست غير موجود.');
      }

      // 2. Validate the requested state transition (if any) BEFORE any write
      if (dto.transition) {
        // Throws AppError(INVALID_TRANSITION) or AppError(PUBLISH_NOT_ALLOWED_HERE)
        this.stateMachine.assertTransition(existing.status as PostStatus, dto.transition);
      }

      // 3. CONTENT_LOCKED check: content edits only allowed in draft or pending_review
      const isContentEdit =
        dto.text !== undefined ||
        dto.hashtags !== undefined ||
        dto.image !== undefined ||
        dto.image_null === true;
      if (isContentEdit && existing.status === 'approved') {
        throw new AppError(
          409,
          'CONTENT_LOCKED',
          'لا يمكن تعديل محتوى منشور مُعتمد. اسحبه للمراجعة أولاً.',
        );
      }

      // 4. Apply content edits + state change in ONE transaction
      const data: Prisma.PostUpdateInput = {};
      if (dto.text !== undefined) data.text = dto.text;
      if (dto.hashtags !== undefined) data.hashtags = dto.hashtags;
      if (dto.scheduledAt !== undefined) data.scheduledAt = new Date(dto.scheduledAt);
      if (dto.scheduledAt_null === true) data.scheduledAt = null;
      if (dto.transition) data.status = dto.transition.to;

      await tx.post.update({
        where: { id: postId },
        data,
      });

      // 5. Image upsert / delete (separate but in the same tx)
      if (dto.image !== undefined) {
        await tx.imageAsset.upsert({
          where: { postId },
          create: { postId, url: dto.image.url, method: dto.image.method },
          update: { url: dto.image.url, method: dto.image.method },
        });
      } else if (dto.image_null === true) {
        await tx.imageAsset.deleteMany({ where: { postId } });
      }

      // 6. Re-read with image + citations to get the final state
      const final = await tx.post.findFirstOrThrow({
        where: { id: postId, tenantId },
        include: { image: true, citations: true },
      });

      return this.toDetail(final);
    });
  }

  private toDetail(row: any): PostDetail {
    const image: PostImage | null = row.image
      ? { url: row.image.url, method: row.image.method }
      : null;
    const citations: PostCitation[] = (row.citations ?? []).map((c: any) => ({
      claim: c.claim,
      sourceUrl: c.sourceUrl,
    }));
    return {
      id: row.id,
      tenantId: row.tenantId,
      brandProfileId: row.brandProfileId,
      platform: row.platform as PostPlatform,
      status: row.status as PostStatus,
      text: row.text,
      hashtags: row.hashtags,
      scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      image,
      citations,
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
