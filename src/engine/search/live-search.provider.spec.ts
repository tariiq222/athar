import { LiveSearchProvider } from './live-search.provider';
import type { BrandProfileInput } from '../types';

const brand: BrandProfileInput = {
  id: 'b',
  tenantId: 'tn',
  tone: '',
  topics: ['economy'],
  prohibitions: [],
  competitors: [],
  keywords: [],
  learnedPreferences: '',
  brandKit: { colors: [], visualStyle: '', font: 'IBM Plex Sans Arabic' },
};

describe('LiveSearchProvider', () => {
  const page = { url: 'https://reuters.com/x', title: 'Reuters', text: 'GDP 4%' };

  it('fetches candidates, extracts facts, records search usage, sets hasFactualClaim=true', async () => {
    const fetcher = { fetchPage: jest.fn().mockResolvedValue(page) } as any;
    const extractor = {
      extract: jest.fn().mockResolvedValue([
        {
          claim: 'GDP 4%',
          sourceUrl: page.url,
          sourceTitle: 'Reuters',
          confidence: 0.9,
        },
      ]),
    } as any;
    const usage = { record: jest.fn().mockResolvedValue(undefined) } as any;
    const candidates = jest.fn().mockResolvedValue(['https://reuters.com/x']);
    const p = new LiveSearchProvider(fetcher, extractor, usage, candidates);

    const fs = await p.research('economy', brand);
    expect(fs.hasFactualClaim).toBe(true);
    expect(fs.facts).toHaveLength(1);
    expect(usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tn', kind: 'search' }),
    );
  });

  it('returns hasFactualClaim=false with no facts when nothing trustworthy is found', async () => {
    const fetcher = { fetchPage: jest.fn().mockResolvedValue(null) } as any;
    const extractor = { extract: jest.fn() } as any;
    const usage = { record: jest.fn().mockResolvedValue(undefined) } as any;
    const candidates = jest.fn().mockResolvedValue(['https://evil.com/a']);
    const p = new LiveSearchProvider(fetcher, extractor, usage, candidates);

    const fs = await p.research('economy', brand);
    expect(fs).toEqual({ hasFactualClaim: false, facts: [] });
    expect(extractor.extract).not.toHaveBeenCalled();
  });

  it('caps fetches at ENGINE_SEARCH_MAX_FETCHES', async () => {
    process.env.ENGINE_SEARCH_MAX_FETCHES = '2';
    const fetcher = { fetchPage: jest.fn().mockResolvedValue(page) } as any;
    const extractor = { extract: jest.fn().mockResolvedValue([]) } as any;
    const usage = { record: jest.fn().mockResolvedValue(undefined) } as any;
    const candidates = jest
      .fn()
      .mockResolvedValue([
        'https://reuters.com/1',
        'https://reuters.com/2',
        'https://reuters.com/3',
      ]);
    const p = new LiveSearchProvider(fetcher, extractor, usage, candidates);

    await p.research('economy', brand);
    expect(fetcher.fetchPage).toHaveBeenCalledTimes(2);
    delete process.env.ENGINE_SEARCH_MAX_FETCHES;
  });
});