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
  it('drafts and records text usage with token units', async () => {
    const provider = {
      draft: jest
        .fn()
        .mockResolvedValue({ text: 't', citations: [], hashtags: [], imageBrief: '' }),
      lastUsage: { inputTokens: 12, outputTokens: 8 },
    } as any;
    const usage = { record: jest.fn().mockResolvedValue(undefined) } as any;
    const stage = new DraftStage(provider, usage);
    const d = await stage.run(input);
    expect(d.text).toBe('t');
    expect(usage.record).toHaveBeenCalledWith({
      tenantId: 'tn',
      kind: 'text',
      units: 20,
      costUsd: 0,
    });
  });
});