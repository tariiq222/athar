import { Injectable } from '@nestjs/common';
import type { Fact } from '../types';
import type { FetchedPage } from './source-fetcher';
import { ClaudeClient } from '../providers/claude/claude.client';
import { UsageRecorder } from '../usage/usage.recorder';
import { textCostUsd } from '../usage/pricing';
import { TenantContextService } from '../../common/tenant-context.service';

/**
 * Asks Claude to extract verifiable factual claims from a fetched page.
 * Each returned Fact is bound to the page's real sourceUrl/sourceTitle —
 * the extractor never invents or alters the URL.
 *
 * Malformed (non-JSON) model output → []. Items missing a claim are dropped.
 * Confidence is clamped to [0, 1].
 *
 * Records one `text` UsageRecord per call so per-fact cost is tracked
 * against the brand's `model` (read from ClaudeClient).
 */
@Injectable()
export class FactExtractor {
  constructor(
    private readonly claude: ClaudeClient,
    private readonly usage: UsageRecorder,
    private readonly tenantContext: TenantContextService,
  ) {}

  async extract(page: FetchedPage, topic: string): Promise<Fact[]> {
    const system =
      'You extract verifiable factual claims from a web page. ' +
      'Return ONLY a JSON array of objects {claim: string, confidence: number 0..1}. ' +
      'Use ONLY claims actually present in the text. If none, return [].';
    const user = `Topic: ${topic}\nPage text (truncated):\n${page.text.slice(0, 6000)}`;
    const res = await this.claude.complete({ system, user, maxTokens: 1024 });

    // Cost is recorded against the model configured on ClaudeClient; the
    // extractor doesn't know which Claude model is in use, so we mirror
    // the production default here (overridden by ConfigService at boot).
    const model = (this.claude as unknown as { model?: string }).model ?? 'claude-3-5-sonnet';
    await this.usage.record({
      tenantId: this.tenantContext.getTenantId(),
      kind: 'text',
      units: res.inputTokens + res.outputTokens,
      costUsd: textCostUsd(
        (model.includes('haiku') ? 'claude-3-5-haiku' : 'claude-3-5-sonnet') as
          'claude-3-5-sonnet' | 'claude-3-5-haiku',
        res.inputTokens,
        res.outputTokens,
      ),
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(res.text);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (p): p is { claim: string; confidence?: number } =>
          typeof p === 'object' &&
          p !== null &&
          typeof (p as { claim?: unknown }).claim === 'string',
      )
      .map((p) => ({
        claim: p.claim,
        sourceUrl: page.url,
        sourceTitle: page.title,
        confidence: Math.max(0, Math.min(1, typeof p.confidence === 'number' ? p.confidence : 0.5)),
      }));
  }
}
