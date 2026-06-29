import { CritiqueStage } from './critique.stage';
import type { DraftInput } from '../providers/content-provider.interface';
import type { Draft } from '../types';

const input: DraftInput = {
  factSet: { hasFactualClaim: false, facts: [] },
  brand: {
    id: 'b',
    tenantId: 'tn',
    tone: '',
    topics: [],
    prohibitions: [],
    competitors: [],
    keywords: [],
    learnedPreferences: '',
    brandKit: { colors: [], visualStyle: '', font: 'IBM Plex Sans Arabic' },
  },
  platform: 'linkedin',
  contentType: 'informational',
};
const d0: Draft = { text: 'v0', citations: [], hashtags: [], imageBrief: '' };

describe('CritiqueStage', () => {
  it('returns immediately with no issues when first critique passes', async () => {
    const provider = {
      critique: jest.fn().mockResolvedValue({ score: 0.9, passed: true, issues: [] }),
      draft: jest.fn(),
      lastUsage: { inputTokens: 1, outputTokens: 1 },
    } as any;
    const usage = { record: jest.fn().mockResolvedValue(undefined) } as any;
    const stage = new CritiqueStage(provider, usage);
    const res = await stage.run(d0, input);
    expect(res).toEqual({ draft: d0, issues: [] });
    expect(provider.draft).not.toHaveBeenCalled();
  });

  it('redrafts then passes on round 2', async () => {
    const provider = {
      critique: jest
        .fn()
        .mockResolvedValueOnce({ score: 0.4, passed: false, issues: ['fix tone'] })
        .mockResolvedValueOnce({ score: 0.95, passed: true, issues: [] }),
      draft: jest
        .fn()
        .mockResolvedValue({ text: 'v1', citations: [], hashtags: [], imageBrief: '' }),
      lastUsage: { inputTokens: 1, outputTokens: 1 },
    } as any;
    const usage = { record: jest.fn().mockResolvedValue(undefined) } as any;
    const stage = new CritiqueStage(provider, usage);
    const res = await stage.run(d0, input);
    expect(res.draft.text).toBe('v1');
    expect(res.issues).toEqual([]);
  });

  it('after the cap returns the best-scoring draft with its issues', async () => {
    process.env.ENGINE_CRITIQUE_MAX_ROUNDS = '3';
    const provider = {
      critique: jest
        .fn()
        .mockResolvedValueOnce({ score: 0.5, passed: false, issues: ['a'] })
        .mockResolvedValueOnce({ score: 0.7, passed: false, issues: ['b'] })
        .mockResolvedValueOnce({ score: 0.6, passed: false, issues: ['c'] }),
      draft: jest
        .fn()
        .mockResolvedValueOnce({ text: 'v1', citations: [], hashtags: [], imageBrief: '' })
        .mockResolvedValueOnce({ text: 'v2', citations: [], hashtags: [], imageBrief: '' }),
      lastUsage: { inputTokens: 1, outputTokens: 1 },
    } as any;
    const usage = { record: jest.fn().mockResolvedValue(undefined) } as any;
    const stage = new CritiqueStage(provider, usage);
    const res = await stage.run(d0, input);
    expect(res.draft.text).toBe('v1'); // highest score 0.7
    expect(res.issues).toEqual(['b']); // issues of the best version
    delete process.env.ENGINE_CRITIQUE_MAX_ROUNDS;
  });
});