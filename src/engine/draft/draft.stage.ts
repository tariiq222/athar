import { Injectable } from '@nestjs/common';
import type { Draft } from '../types';
import type { DraftInput } from '../providers/content-provider.interface';
import { ClaudeContentProvider } from '../providers/claude/claude-content.provider';
import { UsageRecorder } from '../usage/usage.recorder';

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
    const { inputTokens, outputTokens } = this.provider.lastUsage;
    await this.usage.record({
      tenantId: input.brand.tenantId,
      kind: 'text',
      units: inputTokens + outputTokens,
      costUsd: 0,
    });
    return draft;
  }
}