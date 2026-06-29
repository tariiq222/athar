import { Injectable } from '@nestjs/common';
import type { Fact } from '../types';
import type { FetchedPage } from './source-fetcher';
import { ClaudeClient } from '../providers/claude/claude.client';

/**
 * Asks Claude to extract verifiable factual claims from a fetched page.
 * Each returned Fact is bound to the page's real sourceUrl/sourceTitle —
 * the extractor never invents or alters the URL.
 *
 * Malformed (non-JSON) model output → []. Items missing a claim are dropped.
 * Confidence is clamped to [0, 1].
 */
@Injectable()
export class FactExtractor {
  constructor(private readonly claude: ClaudeClient) {}

  async extract(page: FetchedPage, topic: string): Promise<Fact[]> {
    const system =
      'You extract verifiable factual claims from a web page. ' +
      'Return ONLY a JSON array of objects {claim: string, confidence: number 0..1}. ' +
      'Use ONLY claims actually present in the text. If none, return [].';
    const user = `Topic: ${topic}\nPage text (truncated):\n${page.text.slice(0, 6000)}`;
    const { text } = await this.claude.complete({ system, user, maxTokens: 1024 });

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
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
        confidence: Math.max(
          0,
          Math.min(1, typeof p.confidence === 'number' ? p.confidence : 0.5),
        ),
      }));
  }
}