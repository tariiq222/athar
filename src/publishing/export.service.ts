import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Platform } from '../config/platform-limits';
import { ExportFormatter } from './export-formatter.service';
import { DeepLinkBuilder } from './deep-link-builder.service';
import type { ExportPayload } from './publishing.types';
import { notApproved, notFound } from '../common/errors/error-envelope';

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly formatter: ExportFormatter,
    private readonly linker: DeepLinkBuilder,
  ) {}

  async buildPayload(
    tenantId: string,
    postId: string,
    platform?: Platform,
  ): Promise<ExportPayload> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, tenantId },
      include: { image: true, citations: true },
    });
    if (!post) throw notFound();
    if (post.status !== 'approved') throw notApproved();

    const target: Platform = platform ?? (post.platform as Platform);
    const link = post.citations[0]?.sourceUrl as string | undefined;

    const formatted = this.formatter.format({
      platform: target,
      text: post.text,
      hashtags: post.hashtags,
      link,
    });
    const deepLink = this.linker.build(target, formatted.formattedText);

    const payload: ExportPayload = {
      postId: post.id,
      platform: target,
      formattedText: formatted.formattedText,
      deepLink,
      charCount: formatted.charCount,
      limitMax: formatted.limitMax,
      notes: formatted.notes,
    };
    if (post.image?.url) payload.imageUrl = post.image.url;
    if (formatted.link) payload.link = formatted.link;
    return payload;
  }
}
