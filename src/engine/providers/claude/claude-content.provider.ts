import { Injectable } from '@nestjs/common';
import type { ContentProvider, DraftInput } from '../content-provider.interface';
import type { Draft, Rubric, CritiqueResult } from '../../types';
import { ClaudeClient } from './claude.client';

/**
 * Real `ContentProvider` impl. Both `draft` and `critique` go through
 * ClaudeClient only — no other AI SDK touched here.
 *
 * `lastUsage` is reset on every call so the stage wrapper (Task 11/12)
 * can read the most recent token usage and record a UsageRecord.
 */
@Injectable()
export class ClaudeContentProvider implements ContentProvider {
  public lastUsage = { inputTokens: 0, outputTokens: 0 };

  constructor(private readonly claude: ClaudeClient) {}

  async draft(input: DraftInput): Promise<Draft> {
    const factLines = input.factSet.hasFactualClaim
      ? input.factSet.facts
          .map((f) => `- "${f.claim}" (source: ${f.sourceUrl})`)
          .join('\n')
      : '(no trusted source found — write as opinion/tone, make NO factual claim, add NO citation)';

    const system =
      'You are an Arabic brand copywriter. Write a social post in the brand tone. ' +
      'Pair EVERY factual claim with its exact source URL from the provided facts. ' +
      'NEVER invent a source. If no facts are provided, write opinion/tone with empty citations. ' +
      'Return ONLY JSON: {text, citations:[{claim,sourceUrl}], hashtags:[], imageBrief}.';
    const user =
      `Platform: ${input.platform}\nContent type: ${input.contentType}\n` +
      `Tone: ${input.brand.tone}\nAudience: ${input.brand.audience ?? ''}\n` +
      `Prohibitions: ${input.brand.prohibitions.join(', ')}\n` +
      `Learned preferences: ${input.brand.learnedPreferences}\n` +
      `${input.brief ? `Brief: ${input.brief}\n` : ''}` +
      `Facts:\n${factLines}`;

    const res = await this.claude.complete({ system, user, maxTokens: 2048 });
    this.lastUsage = { inputTokens: res.inputTokens, outputTokens: res.outputTokens };

    const parsed = JSON.parse(res.text) as Partial<Draft>;
    const citations = input.factSet.hasFactualClaim ? parsed.citations ?? [] : [];
    return {
      text: parsed.text ?? '',
      citations,
      hashtags: parsed.hashtags ?? [],
      imageBrief: parsed.imageBrief ?? '',
    };
  }

  async critique(draft: Draft, rubric: Rubric): Promise<CritiqueResult> {
    const system =
      'You critique an Arabic social post against a rubric. ' +
      'Return ONLY JSON {score: 0..1, passed: boolean, issues: string[]}. ' +
      'passed=true only if tone, source integrity, platform compliance, prohibitions, and clarity all hold.';
    const user = `Rubric (all must hold): ${JSON.stringify(rubric)}\nPost: ${JSON.stringify(draft)}`;
    const res = await this.claude.complete({ system, user, maxTokens: 1024 });
    this.lastUsage = { inputTokens: res.inputTokens, outputTokens: res.outputTokens };

    const parsed = JSON.parse(res.text) as Partial<CritiqueResult>;
    return {
      score: typeof parsed.score === 'number' ? parsed.score : 0,
      passed: parsed.passed === true,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  }
}