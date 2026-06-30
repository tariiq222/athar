import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Draft, ImageAsset, QuotaStatus } from '../types';
import type { Platform } from '../../config/platform-limits';
import { formatForPlatform } from './platform-formatter';

export class PlatformLimitExceeded extends Error {
  constructor(public readonly overBy: number) {
    super(`platform limit exceeded by ${overBy}`);
    this.name = 'PlatformLimitExceeded';
  }
}

export interface AssembleArgs {
  tenantId: string;
  brandProfileId: string;
  draft: Draft;
  image: ImageAsset | null;
  platform: Platform;
  quotaStatus: QuotaStatus;
  monthPlanId?: string;
}

/**
 * Stage 5 — merges text + citations + image into a persisted `Post`
 * (status `pending_review`, `originalText` saved for the learning diff).
 * If the formatted text does not fit the platform limit, throws
 * `PlatformLimitExceeded` so the pipeline can re-draft with a tighter
 * constraint (Task 19 handles the re-draft signal).
 */
@Injectable()
export class AssembleStage {
  constructor(private readonly prisma: PrismaService) {}

  async run(args: AssembleArgs): Promise<string> {
    const formatted = formatForPlatform(args.draft, args.platform);
    if (!formatted.fits) throw new PlatformLimitExceeded(formatted.overBy);

    const post = await this.prisma.post.create({
      data: {
        tenantId: args.tenantId,
        brandProfileId: args.brandProfileId,
        platform: args.platform,
        status: 'pending_review',
        quotaStatus: args.quotaStatus,
        text: args.draft.text,
        originalText: args.draft.text,
        hashtags: formatted.hashtags,
        monthPlanId: args.monthPlanId,
        citations: {
          create: args.draft.citations.map((c) => ({
            claim: c.claim,
            sourceUrl: c.sourceUrl,
          })),
        },
        ...(args.image
          ? {
              image: {
                create: {
                  url: args.image.url,
                  method: args.image.method,
                  verifiedText: args.image.verifiedText,
                  attempts: args.image.attempts,
                },
              },
            }
          : {}),
      },
    });
    return post.id;
  }
}
