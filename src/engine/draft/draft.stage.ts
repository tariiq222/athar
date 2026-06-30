import { Injectable } from '@nestjs/common';
import type { Draft } from '../types';
import type { DraftInput } from '../providers/content-provider.interface';
import { ClaudeContentProvider } from '../providers/claude/claude-content.provider';
import { UsageRecorder } from '../usage/usage.recorder';
import { textCostUsd } from '../usage/pricing';

/**
 * Stage 2 — generates the initial Draft via the ContentProvider and
 * records a kind:'text' UsageRecord using the provider's lastUsage.
 */
@Injectable()
export class DraftStage {
  constructor(
    private readonly provider: ClaudeContentProvider,
    private readonly usage: UsageRecorder,
  ) {}

  async run(input: DraftInput): Promise<Draft> {
    const draft = await this.provider.draft(input);
    const { inputTokens, outputTokens, model } = this.provider.lastUsage;
    await this.usage.record({
      tenantId: input.brand.tenantId,
      kind: 'text',
      units: inputTokens + outputTokens,
      costUsd: textCostUsd(
        (model === 'claude-3-5-haiku' ? 'claude-3-5-haiku' : 'claude-3-5-sonnet') as
          'claude-3-5-sonnet' | 'claude-3-5-haiku',
        inputTokens,
        outputTokens,
      ),
    });
    return draft;
  }
}
