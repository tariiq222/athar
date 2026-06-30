import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClaudeClient } from '../providers/claude/claude.client';
import { UsageRecorder } from '../usage/usage.recorder';
import { textCostUsd } from '../usage/pricing';

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

  async captureApproval(tenantId: string, postId: string): Promise<void> {
    // Scope by tenantId so a cross-tenant postId cannot leak another
    // tenant's post text into this tenant's learning loop. findUniqueOrThrow
    // only accepts unique fields in `where`, so use findFirstOrThrow to add
    // the tenantId predicate while keeping throw-on-missing behavior.
    const post = await this.prisma.post.findFirstOrThrow({
      where: { id: postId, tenantId },
    });
    if (!post.originalText || post.originalText === post.text) return;

    const system =
      'You compare an original AI draft to the human-approved version and summarize, in ONE short ' +
      'English sentence, the editing preference it reveals (tone, length, wording). Output only that sentence.';
    const user = `Original:\n${post.originalText}\n\nApproved:\n${post.text}`;
    const res = await this.claude.complete({ system, user, maxTokens: 256 });
    const model = (this.claude as unknown as { model?: string }).model ?? '';
    await this.usage.record({
      tenantId: post.tenantId,
      kind: 'text',
      units: res.inputTokens + res.outputTokens,
      costUsd: textCostUsd(
        model.includes('haiku') ? 'claude-3-5-haiku' : 'claude-3-5-sonnet',
        res.inputTokens,
        res.outputTokens,
      ),
    });

    const summary = res.text.trim();
    if (!summary) return;

    const brand = await this.prisma.brandProfile.findFirstOrThrow({
      where: { id: post.brandProfileId, tenantId },
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