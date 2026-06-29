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
    expect(d.citations).toEqual([
      { claim: 'GDP 4%', sourceUrl: 'https://reuters.com/x' },
    ]);
    expect(p.lastUsage).toEqual({ inputTokens: 20, outputTokens: 30 });
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
});