import { DraftStage } from './draft.stage';
import type { DraftInput } from '../providers/content-provider.interface';

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
  platform: 'x',
  contentType: 'thought',
};

describe('DraftStage', () => {
  it('drafts and records text usage with token units and computed cost', async () => {
    const provider = {
      draft: jest
        .fn()
        .mockResolvedValue({ text: 't', citations: [], hashtags: [], imageBrief: '' }),
      lastUsage: { inputTokens: 12, outputTokens: 8, model: 'claude-3-5-sonnet' },
    } as any;
    const usage = { record: jest.fn().mockResolvedValue(undefined) } as any;
    const stage = new DraftStage(provider, usage);
    const d = await stage.run(input);
    expect(d.text).toBe('t');
    // 12 in * 0.003/1k + 8 out * 0.015/1k = 0.000156
    expect(usage.record).toHaveBeenCalledWith({
      tenantId: 'tn',
      kind: 'text',
      units: 20,
      costUsd: expect.closeTo(0.000156, 6),
    });
  });
});
