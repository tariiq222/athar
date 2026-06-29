import { Injectable } from '@nestjs/common';
import type { Draft, CritiqueResult } from '../types';
import type { DraftInput } from '../providers/content-provider.interface';
import { ClaudeContentProvider } from '../providers/claude/claude-content.provider';
import { UsageRecorder } from '../usage/usage.recorder';
import { buildRubric } from './rubric.builder';

/**
 * Stage 3 — quality loop. Critiques the current draft; if it fails,
 * redrafts and re-critiques, up to ENGINE_CRITIQUE_MAX_ROUNDS (clamped
 * to 2..3). Returns the first passing draft, or the highest-scoring
 * draft seen with its issues (visible to the customer) when the cap hits.
 */
@Injectable()
export class CritiqueStage {
  constructor(
    private readonly provider: ClaudeContentProvider,
    private readonly usage: UsageRecorder,
  ) {}

  async run(
    initial: Draft,
    input: DraftInput,
  ): Promise<{ draft: Draft; issues: string[] }> {
    const rubric = buildRubric(input.brand, input.platform);
    const maxRounds = Math.min(
      3,
      Math.max(2, Number(process.env.ENGINE_CRITIQUE_MAX_ROUNDS ?? 3)),
    );

    let current = initial;
    let best: { draft: Draft; result: CritiqueResult } | null = null;

    for (let round = 0; round < maxRounds; round += 1) {
      const result = await this.provider.critique(current, rubric);
      await this.recordUsage(input.brand.tenantId);

      if (result.passed) return { draft: current, issues: [] };
      if (best === null || result.score > best.result.score) {
        best = { draft: current, result };
      }

      if (round < maxRounds - 1) {
        current = await this.provider.draft(input);
        await this.recordUsage(input.brand.tenantId);
      }
    }

    return { draft: best!.draft, issues: best!.result.issues };
  }

  private async recordUsage(tenantId: string): Promise<void> {
    const { inputTokens, outputTokens } = this.provider.lastUsage;
    await this.usage.record({
      tenantId,
      kind: 'text',
      units: inputTokens + outputTokens,
      costUsd: 0,
    });
  }
}