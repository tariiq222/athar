import { ClaudeContentProvider } from './claude-content.provider';
import type { DraftInput } from '../content-provider.interface';
import type { FactSet, Draft, Rubric } from '../../types';

const factSet: FactSet = {
  hasFactualClaim: true,
  facts: [
    {
      claim: 'GDP 4%',
      sourceUrl: 'https://reuters.com/x',
      sourceTitle: 'R',
      confidence: 0.9,
    },
  ],
};
const input: DraftInput = {
  factSet,
  brand: {
    id: 'b',
    tenantId: 'tn',
    tone: 'pro',
    topics: ['eco'],
    prohibitions: [],
    competitors: [],
    keywords: [],
    learnedPreferences: '',
    brandKit: { colors: [], visualStyle: '', font: 'IBM Plex Sans Arabic' },
  },
  platform: 'linkedin',
  contentType: 'informational',
};

describe('ClaudeContentProvider', () => {
  it('draft parses model JSON into a Draft and exposes token usage', async () => {
    const claude = {
      complete: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          text: 'النمو ٤٪',
          citations: [{ claim: 'GDP 4%', sourceUrl: 'https://reuters.com/x' }],
          hashtags: ['#اقتصاد'],
          imageBrief: 'chart',
        }),
        inputTokens: 20,
        outputTokens: 30,
      }),
    } as any;
    const p = new ClaudeContentProvider(claude);
    const d = await p.draft(input);
    expect(d.text).toBe('النمو ٤٪');
    expect(d.citations).toEqual([{ claim: 'GDP 4%', sourceUrl: 'https://reuters.com/x' }]);
    expect(p.lastUsage).toEqual({ inputTokens: 20, outputTokens: 30, model: 'claude-3-5-sonnet' });
  });

  it('draft returns empty citations when there is no factual claim', async () => {
    const claude = {
      complete: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          text: 'رأي',
          citations: [{ claim: 'x', sourceUrl: 'https://made-up.com' }],
          hashtags: [],
          imageBrief: '',
        }),
        inputTokens: 1,
        outputTokens: 1,
      }),
    } as any;
    const p = new ClaudeContentProvider(claude);
    const d = await p.draft({
      ...input,
      factSet: { hasFactualClaim: false, facts: [] },
    });
    expect(d.citations).toEqual([]); // fabricated citation stripped
  });

  it('critique parses score/passed/issues', async () => {
    const claude = {
      complete: jest.fn().mockResolvedValue({
        text: JSON.stringify({ score: 0.6, passed: false, issues: ['tone too casual'] }),
        inputTokens: 5,
        outputTokens: 5,
      }),
    } as any;
    const p = new ClaudeContentProvider(claude);
    const draft: Draft = { text: 't', citations: [], hashtags: [], imageBrief: '' };
    const rubric: Rubric = {
      toneMatch: true,
      sourceIntegrity: true,
      platformCompliance: true,
      prohibitions: true,
      clarity: true,
    };
    const r = await p.critique(draft, rubric);
    expect(r).toEqual({ score: 0.6, passed: false, issues: ['tone too casual'] });
  });

  it('summarize parses Claude JSON into a SummaryResult', async () => {
    const claude = {
      complete: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          tone: 'warm and expert',
          products: ['consulting'],
          audience: 'SMEs in KSA',
          keywords: ['growth', 'brand'],
          suggestedTopics: ['how to onboard clients'],
          suggestedCompetitors: ['competitor-a'],
          colors: ['#0F2E2A'],
          logoUrl: 'https://example.com/logo.png',
          visualStyle: 'editorial, refined',
          confidence: 0.8,
        }),
        inputTokens: 10,
        outputTokens: 10,
      }),
    } as any;
    const p = new ClaudeContentProvider(claude);
    const out = await p.summarize({
      texts: ['We help SMEs grow.'],
      goal: 'brand-analysis',
    });
    expect(out.tone).toBe('warm and expert');
    expect(out.suggestedTopics).toEqual(['how to onboard clients']);
    expect(out.colors).toEqual(['#0F2E2A']);
    expect(out.confidence).toBe(0.8);
  });

  it('summarize returns low confidence and empty arrays for empty input', async () => {
    const claude = {
      complete: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          tone: 'warm',
          products: ['x'],
          audience: 'a',
          keywords: ['k'],
          suggestedTopics: ['t'],
          suggestedCompetitors: [],
          colors: [],
          visualStyle: 'v',
          confidence: 0.9,
        }),
        inputTokens: 1,
        outputTokens: 1,
      }),
    } as any;
    const p = new ClaudeContentProvider(claude);
    const out = await p.summarize({ texts: [], goal: 'brand-analysis' });
    expect(out.confidence).toBeLessThan(0.4);
    expect(out.suggestedTopics).toEqual([]);
    expect(out.keywords).toEqual([]);
    expect(out.products).toEqual([]);
    expect(claude.complete).not.toHaveBeenCalled();
  });
});
