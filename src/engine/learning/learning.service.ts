import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClaudeClient } from '../providers/claude/claude.client';
import { UsageRecorder } from '../usage/usage.recorder';

/**
 * Light learning at launch. When a customer edits/approves a post, the
 * `originalText` vs approved `text` diff is summarized by Claude and
 * appended to the brand profile's `learnedPreferences` — which is then
 * injected into future `DraftInput` user prompts. No automated loop.
 */
@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeClient,
    private readonly usage: UsageRecorder,
  ) {}

  async captureApproval(postId: string): Promise<void> {
    const post = await this.prisma.post.findUniqueOrThrow({
      where: { id: postId },
    });
    if (!post.originalText || post.originalText === post.text) return;

    const system =
      'You compare an original AI draft to the human-approved version and summarize, in ONE short ' +
      'English sentence, the editing preference it reveals (tone, length, wording). Output only that sentence.';
    const user = `Original:\n${post.originalText}\n\nApproved:\n${post.text}`;
    const res = await this.claude.complete({ system, user, maxTokens: 256 });
    await this.usage.record({
      tenantId: post.tenantId,
      kind: 'text',
      units: res.inputTokens + res.outputTokens,
      costUsd: 0,
    });

    const summary = res.text.trim();
    if (!summary) return;

    const brand = await this.prisma.brandProfile.findUniqueOrThrow({
      where: { id: post.brandProfileId },
    });
    const updated = brand.learnedPreferences
      ? `${brand.learnedPreferences}\n${summary}`
      : summary;
    await this.prisma.brandProfile.update({
      where: { id: post.brandProfileId },
      data: { learnedPreferences: updated },
    });
  }
}