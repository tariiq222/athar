import { Injectable } from '@nestjs/common';
import type { ContentProvider, DraftInput, SummarizeInput, SummaryResult } from '../content-provider.interface';
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
  public lastUsage: { inputTokens: number; outputTokens: number; model: 'claude-3-5-sonnet' | 'claude-3-5-haiku' } = {
    inputTokens: 0,
    outputTokens: 0,
    model: 'claude-3-5-sonnet',
  };

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
    this.lastUsage = {
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      model: this.resolveModel(),
    };

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
    this.lastUsage = {
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      model: this.resolveModel(),
    };

    const parsed = JSON.parse(res.text) as Partial<CritiqueResult>;
    return {
      score: typeof parsed.score === 'number' ? parsed.score : 0,
      passed: parsed.passed === true,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  }

  async summarize(input: SummarizeInput): Promise<SummaryResult> {
    // Empty input — no point calling Claude; emit a low-confidence empty
    // summary so downstream code can treat it as "not enough signal".
    if (input.texts.length === 0) {
      return {
        tone: '',
        products: [],
        audience: '',
        keywords: [],
        suggestedTopics: [],
        suggestedCompetitors: [],
        colors: [],
        visualStyle: '',
        confidence: 0.2,
      };
    }

    const system =
      'You are a brand analyst extracting structured signals from Arabic/English source texts ' +
      'for the أثر social-media product. Return ONLY JSON with exactly these keys: ' +
      '{tone, products[], audience, keywords[], suggestedTopics[], suggestedCompetitors[], ' +
      'colors[], logoUrl?, visualStyle, confidence (0..1)}. ' +
      'Be concise. confidence reflects how clearly the brand is signaled.';
    const user =
      `Goal: ${input.goal}\nTexts (${input.texts.length}):\n` +
      input.texts.map((t, i) => `--- [${i}] ---\n${t}`).join('\n');

    const res = await this.claude.complete({ system, user, maxTokens: 1024 });
    this.lastUsage = {
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      model: this.resolveModel(),
    };

    let parsed: Partial<SummaryResult> = {};
    try {
      parsed = JSON.parse(res.text) as Partial<SummaryResult>;
    } catch {
      // Malformed JSON — fail safe with a low-confidence empty result.
      return {
        tone: '',
        products: [],
        audience: '',
        keywords: [],
        suggestedTopics: [],
        suggestedCompetitors: [],
        colors: [],
        visualStyle: '',
        confidence: 0.2,
      };
    }

    const clamp = (n: unknown): number => {
      const v = typeof n === 'number' ? n : NaN;
      if (!Number.isFinite(v)) return 0.2;
      return Math.min(1, Math.max(0, v));
    };
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    const arr = (v: unknown) =>
      Array.isArray(v) ? v.filter((s) => typeof s === 'string') : [];

    return {
      tone: str(parsed.tone),
      products: arr(parsed.products),
      audience: str(parsed.audience),
      keywords: arr(parsed.keywords),
      suggestedTopics: arr(parsed.suggestedTopics),
      suggestedCompetitors: arr(parsed.suggestedCompetitors),
      colors: arr(parsed.colors),
      logoUrl: typeof parsed.logoUrl === 'string' ? parsed.logoUrl : undefined,
      visualStyle: str(parsed.visualStyle),
      confidence: clamp(parsed.confidence),
    };
  }

  /**
   * Map the configured Claude model to a pricing-table key. Anything not
   * `claude-3-5-haiku` is treated as Sonnet (the documented default).
   */
  private resolveModel(): 'claude-3-5-sonnet' | 'claude-3-5-haiku' {
    const m = (this.claude as unknown as { model?: string }).model ?? '';
    return m.includes('haiku') ? 'claude-3-5-haiku' : 'claude-3-5-sonnet';
  }
}
